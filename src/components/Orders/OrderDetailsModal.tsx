import React from 'react';
import { useEffect, useState } from 'react';
import { Order, PaymentStatus, PAYMENT_STATUSES, WARRANTY_STATUSES } from '../../types';
import { Database } from '../../utils/database';
import { getSupabase } from '../../utils/supabaseClient';

type Getters = {
	getCustomerName: (customerId: string) => string;
	getCustomerCode?: (customerId: string) => string; // optional
	getPackageInfo: (packageId: string) => { package?: any; product?: any } | null;
	getStatusLabel: (status: any) => string;
	getPaymentLabel?: (status: any) => string;
	getOrderPrice?: (order: Order) => number; // optional, for consistent price calculation
};

type InventoryAccess = {
	inventory: any[];
	products: any[];
	packages: any[];
};

interface OrderDetailsModalProps extends Getters, InventoryAccess {
	order: Order;
	onClose: () => void;
	formatDate: (d: Date) => string;
	formatPrice?: (n: number) => string;
	onCopyInfo?: () => Promise<void> | void;
	onOpenRenew?: () => void; // optional, only Orders list wires this
	onOrderUpdated?: () => void | Promise<void>; // optional, callback when order is updated
}

const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({
	order,
	onClose,
	inventory,
	products,
	packages,
	getCustomerName,
	getCustomerCode,
	getPackageInfo,
	getStatusLabel,
	getPaymentLabel,
	formatDate,
	formatPrice,
	onCopyInfo,
	onOpenRenew,
	getOrderPrice: getOrderPriceProp,
	onOrderUpdated
}) => {
	// Local warranties state to ensure live updates without hard refresh
	const [warranties, setWarranties] = useState<any[]>([]);
	// Force re-render when warranties for this order change (realtime)
	const [warrantyTick, setWarrantyTick] = useState(0);
	useEffect(() => {
		const sb = getSupabase();
		if (!sb) return;
		const ch = sb
			.channel(`realtime:order-warranties:${order.id}`)
			.on('postgres_changes', { event: '*', schema: 'public', table: 'warranties', filter: `order_id=eq.${order.id}` }, () => {
				setWarrantyTick((v) => v + 1);
			})
			.subscribe();
		return () => { 
			try { 
				ch.unsubscribe(); 
		} catch (error) {
			// Error unsubscribing from realtime channel - ignore
		}
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [order.id]);

	// Load warranties for this order and refresh on realtime tick
	useEffect(() => {
		(async () => {
			try {
				const sb = getSupabase();
				if (sb) {
					const { data } = await sb
						.from('warranties')
						.select('*')
						.eq('order_id', order.id)
						.order('created_at', { ascending: true });
					setWarranties((data || []).map((r: any) => ({
						id: r.id,
						code: r.code,
						reason: r.reason,
						status: r.status,
						createdAt: r.created_at ? new Date(r.created_at) : new Date()
					})));
				} else {
					setWarranties(Database.getWarrantiesByOrder(order.id));
				}
			} catch (e) {
				setWarranties(Database.getWarrantiesByOrder(order.id));
			}
		})();
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [order.id, warrantyTick]);
	const pkgInfo = getPackageInfo(order.packageId);
	const paymentLabel = (PAYMENT_STATUSES.find(p => p.value === (order as any).paymentStatus)?.label) || 'Chưa thanh toán';

	// Calculate order price - use provided function if available, otherwise calculate locally
	const getOrderPrice = () => {
		if (getOrderPriceProp) {
			return getOrderPriceProp(order);
		}
		// Fallback calculation - prioritize salePrice (snapshot price)
		// Respect custom price if set
		if ((order as any).useCustomPrice && typeof (order as any).customPrice === 'number' && (order as any).customPrice > 0) {
			return (order as any).customPrice;
		}
		// Use sale_price snapshot if available (this is the standard price)
		if (typeof (order as any).salePrice === 'number' && (order as any).salePrice > 0) {
			return (order as any).salePrice;
		}
		// Fallback to package price
		const pkg = pkgInfo?.package;
		if (!pkg) return 0;
		return pkg.retailPrice || pkg.ctvPrice || 0;
	};

	const findInventory = () => {
		// First try to find by inventoryItemId if it exists, but verify actual link
		if ((order as any).inventoryItemId) {
			const found = inventory.find(i => i.id === (order as any).inventoryItemId);
			if (found) {
				// For account-based inventory, verify that at least one slot is assigned to this order
				if (found.is_account_based || found.isAccountBased) {
					const profiles = found.profiles || [];
					const hasAssignedSlot = profiles.some((p: any) => 
						p.isAssigned && p.assignedOrderId === order.id
					);
					if (hasAssignedSlot) return found;
					// No assigned slot, but check if order has inventory_profile_ids that match
					const orderProfileIds = (order as any).inventoryProfileIds;
					if (orderProfileIds && Array.isArray(orderProfileIds) && orderProfileIds.length > 0) {
						const hasValidProfile = orderProfileIds.some((profileId: string) => {
							const profile = profiles.find((p: any) => p.id === profileId);
							return profile && profile.isAssigned && profile.assignedOrderId === order.id;
						});
						if (hasValidProfile) return found;
					}
					// No valid link found, don't return this inventory
					return null;
				} else {
					// For classic inventory, verify linked_order_id matches
					if (found.linked_order_id === order.id || found.linkedOrderId === order.id) {
						return found;
					}
					// No valid link found, don't return this inventory
					return null;
				}
			}
		}
		// Fallback 1: find by linkedOrderId (classic single-item link)
		const byLinked = inventory.find(i => i.linked_order_id === order.id || i.linkedOrderId === order.id);
		if (byLinked) return byLinked;
		// Fallback 2: account-based items where a profile is actually assigned to this order
		// Check both: order has inventory_profile_ids AND the profiles are actually assigned
		const orderProfileIds = (order as any).inventoryProfileIds;
		if (orderProfileIds && Array.isArray(orderProfileIds) && orderProfileIds.length > 0) {
			const found = inventory.find(i => {
				if (!(i.is_account_based || i.isAccountBased)) return false;
				const profiles = i.profiles || [];
				// Check if any of the order's profile IDs actually exist and are assigned to this order
				return orderProfileIds.some((profileId: string) => {
					const profile = profiles.find((p: any) => p.id === profileId);
					return profile && profile.isAssigned && profile.assignedOrderId === order.id;
				});
			});
			if (found) return found;
		}
		// Fallback 3: account-based items where a profile is assigned to this order (without checking inventory_profile_ids)
		return inventory.find(i => i.is_account_based || i.isAccountBased
			? (i.profiles || []).some((p: any) => p.assignedOrderId === order.id && p.isAssigned)
			: false);
	};

	const inv = findInventory();
	
	// Check if order has stuck inventory links (has inventory_item_id or inventory_profile_ids but no actual link)
	const hasStuckInventoryLink = ((order as any).inventoryItemId || ((order as any).inventoryProfileIds && Array.isArray((order as any).inventoryProfileIds) && (order as any).inventoryProfileIds.length > 0)) && !inv;
	
	const handleFixStuckInventoryLink = async () => {
		const sb = getSupabase();
		if (!sb) return;
		
		try {
			await sb.from('orders').update({
				inventory_item_id: null,
				inventory_profile_ids: null
			}).eq('id', order.id);
			
			if (onOrderUpdated) {
				await onOrderUpdated();
			}
			// Close modal to force refresh
			onClose();
		} catch (error) {
			console.error('Error fixing stuck inventory link:', error);
		}
	};

	const renderInventoryCard = () => {
		if (!inv) {
			return (
				<div>
					<strong>Kho hàng:</strong> Không liên kết
				</div>
			);
		}
		const product = products.find(p => p.id === inv.productId);
		const packageInfo = packages.find((p: any) => p.id === inv.packageId);
		const productName = product?.name || 'Không xác định';
		const packageName = packageInfo?.name || 'Không xác định';
		const isSharedPool = product?.sharedInventoryPool;
			const linkedSlots: string[] = Array.isArray(inv.profiles)
				? (inv.profiles as any[])
					.filter(p => p.assignedOrderId === order.id)
					.map(p => (p.label || p.id))
				: [];
		const accountColumns = (() => {
			if (inv.accountColumns && inv.accountColumns.length > 0) {
				return inv.accountColumns;
			}
			if (packageInfo?.accountColumns && packageInfo.accountColumns.length > 0) {
				return packageInfo.accountColumns;
			}
			const pkg = pkgInfo?.package;
			if (pkg?.accountColumns && pkg.accountColumns.length > 0) {
				return pkg.accountColumns;
			}
			return [];
		})();
		const accountData = inv.accountData || {};
		return (
			<div className="card mt-2">
				<div className="card-header">
					<strong>📦 Thông tin kho hàng</strong>
				</div>
				<div className="card-body">
					<div><strong>Sản phẩm:</strong> {productName}</div>
					<div><strong>Gói:</strong> {packageName}</div>
					<div><strong>Mã kho:</strong> {inv.code}</div>
					<div><strong>Nhập:</strong> {inv.purchaseDate ? new Date(inv.purchaseDate).toLocaleDateString('vi-VN') : 'N/A'}</div>
					{inv.expiryDate && (
						<div><strong>Hết hạn:</strong> {new Date(inv.expiryDate).toLocaleDateString('vi-VN')}</div>
					)}
					<div><strong>Nguồn:</strong> {inv.sourceNote || '-'}</div>
					{typeof inv.purchasePrice === 'number' && (
						<div><strong>Giá mua:</strong> {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(inv.purchasePrice)}</div>
					)}
					<div><strong>Trạng thái:</strong> {inv.status === 'AVAILABLE' ? 'Có sẵn' : inv.status === 'SOLD' ? 'Đã bán' : inv.status === 'RESERVED' ? 'Đã giữ' : (inv.status || '-')}</div>
					{(inv as any).paymentStatus && (
						<div><strong>Thanh toán:</strong> {(inv as any).paymentStatus === 'PAID' ? 'Đã thanh toán' : 'Chưa thanh toán'}</div>
					)}
					{inv.productInfo && (
						<div style={{ marginTop: 6 }}>
							<strong>Thông tin sản phẩm:</strong>
							<pre style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0 0', padding: '8px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '4px', fontSize: '14px' }}>
								{inv.productInfo}
							</pre>
						</div>
					)}
					{inv.notes && (
						<div style={{ marginTop: 6 }}><strong>Ghi chú nội bộ:</strong> {inv.notes}</div>
					)}
					{accountColumns.length > 0 && (
						<div style={{ marginTop: 12 }}>
							<strong>Thông tin tài khoản:</strong>
							<div style={{ marginTop: 6 }}>
								{accountColumns.map((col: any) => {
									const value = accountData[col.id] || '';
									return (
										<div key={col.id} style={{ marginBottom: 8 }}>
											<div><strong>{col.title}:</strong></div>
											<pre style={{ 
												whiteSpace: 'pre-wrap', 
												margin: 0, 
												padding: '8px', 
												backgroundColor: 'var(--bg-tertiary)', 
												color: 'var(--text-primary)',
												borderRadius: '4px',
												fontSize: '14px',
												border: '1px solid var(--border-color)'
											}}>
												{value || '-'}
											</pre>
										</div>
									);
								})}
							</div>
						</div>
					)}
					{linkedSlots.length > 0 && (
						<div style={{ marginTop: 8 }}>
							<strong>Slot liên kết:</strong> {linkedSlots.join(', ')}
						</div>
					)}
				</div>
			</div>
		);
	};

	const renderCustomFields = () => {
		const pkg = pkgInfo?.package;
		const customFieldValues = (order as any).customFieldValues || {};
		if (!pkg || !pkg.customFields || pkg.customFields.length === 0) return null;
		const fieldsWithValues = pkg.customFields.filter((cf: any) => {
			const value = customFieldValues[cf.id];
			return value !== undefined && String(value).trim();
		});
		if (fieldsWithValues.length === 0) return null;
		return (
			<div className="card mt-2">
				<div className="card-header">
					<strong>📝 Trường tùy chỉnh</strong>
				</div>
				<div className="card-body">
					{fieldsWithValues.map((cf: any) => {
						const value = customFieldValues[cf.id];
						return (
							<div key={cf.id} style={{ marginBottom: 8 }}>
								<div><strong>{cf.title}:</strong></div>
								<pre style={{ 
									whiteSpace: 'pre-wrap', 
									margin: 0, 
									padding: '8px', 
									backgroundColor: 'var(--bg-tertiary)', 
									color: 'var(--text-primary)',
									borderRadius: '4px',
									fontSize: '14px',
									border: '1px solid var(--border-color)'
								}}>
									{String(value).trim()}
								</pre>
							</div>
						);
					})}
				</div>
			</div>
		);
	};

	return (
		<div className="modal">
			<div className="modal-content" style={{ maxWidth: '640px' }}>
				<div className="modal-header">
					<h3 className="modal-title">Chi tiết đơn hàng</h3>
					<button type="button" className="close" onClick={onClose}>×</button>
				</div>
				<div className="mb-3">
					<div><strong>Mã đơn hàng:</strong> {order.code}</div>
					<div><strong>Mã khách hàng:</strong> {getCustomerCode ? (getCustomerCode(order.customerId) || '-') : '-'}</div>
					<div><strong>Khách hàng:</strong> {getCustomerName(order.customerId)}</div>
					<div><strong>Sản phẩm:</strong> {pkgInfo?.product?.name || 'Không xác định'}</div>
					<div><strong>Gói:</strong> {pkgInfo?.package?.name || 'Không xác định'}</div>
					<div><strong>Ngày mua:</strong> {formatDate(order.purchaseDate)}</div>
					<div><strong>Ngày hết hạn:</strong> {formatDate(order.expiryDate)}</div>
					<div><strong>Trạng thái:</strong> {getStatusLabel(order.status)}</div>
					<div><strong>Thanh toán:</strong> {getPaymentLabel ? (getPaymentLabel(order.paymentStatus) || 'Chưa thanh toán') : paymentLabel}</div>
					<div><strong>Giá đơn hàng:</strong> {formatPrice ? formatPrice(getOrderPrice()) : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(getOrderPrice())}</div>

					{renderInventoryCard()}
					{renderCustomFields()}
					{order.notes && <div><strong>Ghi chú:</strong> {order.notes}</div>}
					{(() => {
						const list = warranties;
						return (
							<div style={{ marginTop: '12px' }}>
								<strong>Lịch sử bảo hành:</strong>
								{list.length === 0 ? (
									<div>Chưa có</div>
								) : (
									<ul style={{ paddingLeft: '18px', marginTop: '6px' }}>
										{list.map((w: any) => (
											<li key={w.id}>
												{new Date(w.createdAt).toLocaleDateString('vi-VN')} - {w.code} - {w.reason} ({WARRANTY_STATUSES.find(s => s.value === w.status)?.label || w.status})
											</li>
										))}
									</ul>
								)}
							</div>
						);
					})()}
					{(() => {
						const renewals = ((order as any).renewals || []) as Array<{
							id: string;
							months: number;
							packageId?: string;
							price?: number;
							useCustomPrice?: boolean;
							previousExpiryDate: Date;
							newExpiryDate: Date;
							note?: string;
							paymentStatus: PaymentStatus;
							createdAt: Date;
							createdBy: string;
						}>;
						if (!renewals.length) return (
							<div style={{ marginTop: '12px' }}>
								<strong>Lịch sử gia hạn:</strong>
								<div>Chưa có</div>
							</div>
						);
						return (
							<div style={{ marginTop: '12px' }}>
								<strong>Lịch sử gia hạn:</strong>
								<ul style={{ paddingLeft: '18px', marginTop: '6px' }}>
									{renewals.map(r => (
										<li key={r.id}>
											{new Date(r.createdAt).toLocaleDateString('vi-VN')} · +{r.months} tháng · HSD: {new Date(r.previousExpiryDate).toLocaleDateString('vi-VN')} → {new Date(r.newExpiryDate).toLocaleDateString('vi-VN')} · Gói: {getPackageInfo(r.packageId || order.packageId)?.package?.name || 'Không xác định'} · Giá: {typeof r.price === 'number' && formatPrice ? formatPrice(r.price) : (typeof r.price === 'number' ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(r.price) : '-') } · TT: {(getPaymentLabel ? getPaymentLabel(r.paymentStatus) : (PAYMENT_STATUSES.find(p => p.value === r.paymentStatus)?.label || ''))}{r.note ? ` · Ghi chú: ${r.note}` : ''}
										</li>
									))}
								</ul>
							</div>
						);
					})()}
				</div>
				{hasStuckInventoryLink && (
					<div className="alert alert-warning mt-2">
						<strong>⚠️ Cảnh báo:</strong> Đơn hàng này có liên kết kho hàng trong database nhưng không tìm thấy slot nào được gán. 
						<button className="btn btn-sm btn-warning mt-2" onClick={handleFixStuckInventoryLink}>
							Fix liên kết kho hàng
						</button>
					</div>
				)}
				<div className="d-flex justify-content-end gap-2">
					{onOpenRenew && (
						<button className="btn btn-success" onClick={onOpenRenew}>Gia hạn</button>
					)}
					{onCopyInfo && (
						<button className="btn btn-light" onClick={() => void onCopyInfo()}>Copy thông tin</button>
					)}
					<button className="btn btn-secondary" onClick={onClose}>Đóng</button>
				</div>
			</div>
		</div>
	);
};

export default OrderDetailsModal;


