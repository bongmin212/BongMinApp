import React from 'react';
import { useEffect, useState } from 'react';
import { Order, PaymentStatus, PAYMENT_STATUSES, WARRANTY_STATUSES, INVENTORY_PAYMENT_STATUSES_FULL } from '../../types';
import { Database } from '../../utils/database';
import { getSupabase } from '../../utils/supabaseClient';
import { useToast } from '../../contexts/ToastContext';

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
	const { notify } = useToast();
	// Local warranties state to ensure live updates without hard refresh
	const [warranties, setWarranties] = useState<any[]>([]);
	const [notesExpanded, setNotesExpanded] = useState(false);
	const [renewalsExpanded, setRenewalsExpanded] = useState(false);
	// Force re-render when warranties for this order change (realtime)
	const [warrantyTick, setWarrantyTick] = useState(0);
	const RENEWALS_PREVIEW_LIMIT = 3;

	useEffect(() => {
		setRenewalsExpanded(false);
	}, [order.id]);
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
	const renewalsForStatus = Array.isArray((order as any).renewals) ? ((order as any).renewals || []) : [];

	// Tính toán payment status hiển thị: nếu có ít nhất 1 renewal chưa thanh toán thì hiển thị "Chưa thanh toán"
	const getDisplayPaymentStatus = (): PaymentStatus => {
		// Nếu order đã hoàn tiền, giữ nguyên
		if ((order as any).paymentStatus === 'REFUNDED') {
			return 'REFUNDED';
		}

		if (renewalsForStatus.length > 0) {
			const hasUnpaidRenewal = renewalsForStatus.some((r: any) => {
				const renewalPaymentStatus = r.paymentStatus || 'UNPAID';
				return renewalPaymentStatus !== 'PAID' && renewalPaymentStatus !== 'REFUNDED';
			});
			if (hasUnpaidRenewal) {
				return 'UNPAID';
			}
		}

		return ((order as any).paymentStatus || 'UNPAID') as PaymentStatus;
	};

	const displayPaymentStatus = getDisplayPaymentStatus();
	const displayPaymentLabel = getPaymentLabel
		? (getPaymentLabel(displayPaymentStatus) || 'Chưa thanh toán')
		: ((PAYMENT_STATUSES.find(p => p.value === displayPaymentStatus)?.label) || 'Chưa thanh toán');

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
		const productId = inv.productId || inv.product_id;
		const packageId = inv.packageId || inv.package_id;
		const product = products.find(p => p.id === productId);
		const packageInfo = packages.find((p: any) => p.id === packageId);
		const productName = product?.name || 'Không xác định';
		const isSharedPool = product?.sharedInventoryPool;
		const packageName = packageInfo?.name || (isSharedPool ? 'Kho chung' : 'Không có gói');
		const linkedSlots: string[] = Array.isArray(inv.profiles)
			? (inv.profiles as any[])
				.filter(p => p.assignedOrderId === order.id)
				.map(p => (p.label || p.id))
			: [];
		const accountColumns = (() => {
			// Priority 1: Check inventory accountColumns (both camelCase and snake_case)
			const invCols = inv.accountColumns || (inv as any).account_columns;
			if (invCols && Array.isArray(invCols) && invCols.length > 0) {
				return invCols;
			}
			// Priority 2: Check package from inventory accountColumns (inventory's package, not order's package)
			const pkgCols = packageInfo?.accountColumns || (packageInfo as any)?.account_columns;
			if (pkgCols && Array.isArray(pkgCols) && pkgCols.length > 0) {
				return pkgCols;
			}
			// Priority 3: Fallback to order package accountColumns (for non-shared-pool cases)
			const orderPackage = pkgInfo?.package;
			const orderPkgCols = orderPackage?.accountColumns || (orderPackage as any)?.account_columns;
			if (orderPkgCols && Array.isArray(orderPkgCols) && orderPkgCols.length > 0) {
				return orderPkgCols;
			}
			return [];
		})();
		const displayColumns = Array.isArray(accountColumns) ? accountColumns : [];
		const accountData = inv.accountData || (inv as any).account_data || {};
		return (
			<div className="card mt-2">
				<div className="card-header">
					<strong>📦 Thông tin kho hàng</strong>
				</div>
				<div className="card-body">
					<div><strong>Sản phẩm:</strong> {productName}</div>
					<div><strong>Gói/Pool:</strong> {packageName}</div>
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
						<div><strong>Thanh toán:</strong> {INVENTORY_PAYMENT_STATUSES_FULL.find(s => s.value === (inv as any).paymentStatus)?.label || 'Chưa thanh toán'}</div>
					)}
					<div>
						<strong>Trạng thái Active:</strong>{' '}
						<span style={{ color: (inv as any).isActive !== false ? '#28a745' : '#dc3545', fontWeight: 500 }}>
							{(inv as any).isActive !== false ? 'Active' : 'Not Active'}
						</span>
					</div>
					{inv.productInfo && (
						<div style={{ marginTop: 6 }}>
							<strong>Thông tin sản phẩm:</strong>
							<pre style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0 0', padding: '8px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '4px', fontSize: '14px' }}>
								{inv.productInfo}
							</pre>
						</div>
					)}
					<div style={{ marginTop: 6 }}>
						<strong>Ghi chú nội bộ:</strong>
						{inv.notes ? (
							<pre style={{
								whiteSpace: 'pre-wrap',
								margin: '4px 0 0 0',
								padding: '8px',
								backgroundColor: 'var(--bg-tertiary)',
								borderRadius: '4px',
								fontSize: '14px',
								border: '1px solid var(--border-color)'
							}}>
								{inv.notes}
							</pre>
						) : (
							<span style={{ marginLeft: 4 }} className="text-muted">Không có</span>
						)}
					</div>
					{/* Account Information Section - only show columns that have data */}
					{(() => {
						// Filter to only columns that have actual data
						const columnsWithData = displayColumns.filter((col: any) => {
							const value = accountData[col.id];
							return value !== undefined && value !== null && String(value).trim() !== '';
						});

						if (columnsWithData.length === 0) return null;

						return (
							<div style={{ marginTop: 12 }}>
								<strong>Thông tin tài khoản:</strong> <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>(Bấm vào để copy)</span>
								<div style={{ marginTop: 6 }}>
									{columnsWithData.map((col: any) => {
										const value = accountData[col.id] || '';
										return (
											<div key={col.id} style={{ marginBottom: 8 }}>
												<div><strong>{col.title}:</strong></div>
												<pre
													style={{
														whiteSpace: 'pre-wrap',
														margin: 0,
														padding: '8px',
														backgroundColor: 'var(--bg-tertiary)',
														color: 'var(--text-primary)',
														borderRadius: '4px',
														fontSize: '14px',
														border: '1px solid var(--border-color)',
														cursor: 'pointer',
														transition: 'background-color 0.2s'
													}}
													onClick={() => {
														navigator.clipboard.writeText(value).then(() => {
															notify(`Đã copy ${col.title}`, 'success');
														}).catch(() => {
															notify('Không thể copy', 'error');
														});
													}}
													onMouseEnter={(e) => {
														(e.target as HTMLPreElement).style.backgroundColor = 'var(--bg-hover)';
													}}
													onMouseLeave={(e) => {
														(e.target as HTMLPreElement).style.backgroundColor = 'var(--bg-tertiary)';
													}}
													title={`Bấm để copy ${col.title}`}
												>
													{value}
												</pre>
											</div>
										);
									})}
								</div>
							</div>
						);
					})()}
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
					<strong>📝 Trường tùy chỉnh</strong> <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 'normal' }}>(Bấm vào để copy)</span>
				</div>
				<div className="card-body">
					{fieldsWithValues.map((cf: any) => {
						const value = customFieldValues[cf.id];
						return (
							<div key={cf.id} style={{ marginBottom: 8 }}>
								<div><strong>{cf.title}:</strong></div>
								<pre
									style={{
										whiteSpace: 'pre-wrap',
										margin: 0,
										padding: '8px',
										backgroundColor: 'var(--bg-tertiary)',
										color: 'var(--text-primary)',
										borderRadius: '4px',
										fontSize: '14px',
										border: '1px solid var(--border-color)',
										cursor: 'pointer',
										transition: 'background-color 0.2s'
									}}
									onClick={() => {
										navigator.clipboard.writeText(String(value).trim()).then(() => {
											notify(`Đã copy ${cf.title}`, 'success');
										}).catch(() => {
											notify('Không thể copy', 'error');
										});
									}}
									onMouseEnter={(e) => {
										(e.target as HTMLPreElement).style.backgroundColor = 'var(--bg-hover)';
									}}
									onMouseLeave={(e) => {
										(e.target as HTMLPreElement).style.backgroundColor = 'var(--bg-tertiary)';
									}}
									title={`Bấm để copy ${cf.title}`}
								>
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
					<div>
						<strong>Thanh toán:</strong>{' '}
						{displayPaymentLabel}
						{displayPaymentStatus === 'REFUNDED' && (order as any).refundAmount > 0 && (
							<span className="ms-2 text-muted">
								(Đã hoàn: {formatPrice ? formatPrice((order as any).refundAmount) : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format((order as any).refundAmount)})
							</span>
						)}
					</div>
					<div><strong>Giá đơn hàng:</strong> {formatPrice ? formatPrice(getOrderPrice()) : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(getOrderPrice())}</div>

					<div>
						<strong>Ghi chú:</strong>{' '}
						{(() => {
							const notes = order.notes && String(order.notes).trim() ? String(order.notes).trim() : '';
							const LIMIT = 120;
							if (!notes) return <span className="text-muted">Không có</span>;
							if (notes.length <= LIMIT) return <span style={{ whiteSpace: 'pre-wrap' }}>{notes}</span>;
							return (
								<span>
									<span style={{ whiteSpace: 'pre-wrap' }}>
										{notesExpanded ? notes : notes.slice(0, LIMIT) + '...'}
									</span>
									{' '}
									<button
										type="button"
										className="btn btn-link p-0"
										style={{ fontSize: '13px', verticalAlign: 'baseline', textDecoration: 'underline' }}
										onClick={() => setNotesExpanded(v => !v)}
									>
										{notesExpanded ? 'Thu gọn' : 'Xem thêm'}
									</button>
								</span>
							);
						})()}
					</div>
					{renderInventoryCard()}
					{renderCustomFields()}
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
							previousPackageId?: string;
							price?: number;
							useCustomPrice?: boolean;
							previousExpiryDate: Date;
							newExpiryDate: Date;
							note?: string;
							paymentStatus: PaymentStatus;
							createdAt: Date;
							createdBy: string;
						}>;
						const shouldCollapseRenewals = renewals.length > RENEWALS_PREVIEW_LIMIT;
						const visibleRenewals = shouldCollapseRenewals && !renewalsExpanded
							? renewals.slice(-RENEWALS_PREVIEW_LIMIT)
							: renewals;
						const hiddenRenewalsCount = renewals.length - visibleRenewals.length;

						// Hàm tính số tháng giữa 2 ngày
						const monthsBetween = (date1: Date, date2: Date): number => {
							const d1 = new Date(date1);
							const d2 = new Date(date2);
							const years = d2.getFullYear() - d1.getFullYear();
							const months = d2.getMonth() - d1.getMonth();
							return years * 12 + months;
						};

						// Hàm tìm gói theo warrantyPeriod, ưu tiên gói cùng productId với order
						const findPackageByWarrantyPeriod = (months: number): string | undefined => {
							const currentProductId = pkgInfo?.product?.id;
							// Ưu tiên tìm gói cùng productId trước
							if (currentProductId) {
								const matchingPackage = packages.find((p: any) =>
									p.productId === currentProductId && Math.floor(p.warrantyPeriod || 0) === months
								);
								if (matchingPackage) return matchingPackage.id;
							}
							// Nếu không tìm thấy, tìm bất kỳ gói nào có warrantyPeriod khớp
							const matchingPackage = packages.find((p: any) =>
								Math.floor(p.warrantyPeriod || 0) === months
							);
							return matchingPackage?.id;
						};

						// Hàm suy luận previousPackageId cho dữ liệu cũ
						const inferPreviousPackageId = (renewalIndex: number): string | undefined => {
							const r = renewals[renewalIndex];
							// Nếu đã có previousPackageId, dùng nó
							if (r.previousPackageId) return r.previousPackageId;

							// Nếu là renewal đầu tiên, cần tìm packageId ban đầu
							if (renewalIndex === 0) {
								// Suy luận từ hạn sử dụng ban đầu (previousExpiryDate) và purchaseDate
								if (r.previousExpiryDate) {
									const months = monthsBetween(order.purchaseDate, new Date(r.previousExpiryDate));
									const inferredPackageId = findPackageByWarrantyPeriod(months);
									if (inferredPackageId) return inferredPackageId;
								}

								// Fallback: Nếu order.packageId khác với packageId của renewal đầu tiên,
								// thì order.packageId có thể là package ban đầu
								if (order.packageId !== (r.packageId || order.packageId)) {
									return order.packageId;
								}

								// Nếu không suy luận được, trả về undefined
								return undefined;
							}

							// Các renewal sau: dùng packageId của renewal trước đó
							const prevRenewal = renewals[renewalIndex - 1];
							return prevRenewal?.packageId || order.packageId;
						};

						// Tính toán packageId ban đầu (trước tất cả các renewals)
						// Nếu có renewals, packageId ban đầu là previousPackageId của renewal đầu tiên
						// Nếu không có hoặc không thể suy luận, dùng order.packageId hiện tại
						const originalPackageId = renewals.length > 0
							? (inferPreviousPackageId(0) || order.packageId)
							: order.packageId;

						// Tính toán hạn sử dụng ban đầu
						// Nếu có renewals, dùng previousExpiryDate của renewal đầu tiên
						// Nếu không có, tính từ purchaseDate + warrantyPeriod của gói ban đầu
						const originalExpiryDate = renewals.length > 0 && renewals[0].previousExpiryDate
							? new Date(renewals[0].previousExpiryDate)
							: (() => {
								const originalPkg = getPackageInfo(originalPackageId)?.package;
								if (originalPkg && originalPkg.warrantyPeriod) {
									const expiry = new Date(order.purchaseDate);
									expiry.setMonth(expiry.getMonth() + Math.floor(originalPkg.warrantyPeriod));
									return expiry;
								}
								// Fallback: dùng order.expiryDate nếu không tính được
								return order.expiryDate;
							})();

						const originalPkgInfo = getPackageInfo(originalPackageId);
						// Lấy giá ban đầu:
						// - Ưu tiên dùng originalSalePrice (giá được snapshot lúc mua ban đầu).
						// - Nếu không có, fallback sang giá hiện tại của đơn hàng.
						const originalPrice = (() => {
							const explicit = (order as any).originalSalePrice;
							if (typeof explicit === 'number' && explicit > 0) {
								return explicit;
							}
							// Fallback: dùng giá hiện tại của đơn hàng
							return getOrderPrice();
						})();

						return (
							<div style={{ marginTop: '16px' }}>
								<strong style={{ fontSize: '16px' }}>Lịch sử gia hạn:</strong>

								{/* Timeline: Mua ban đầu */}
								<div className="card mt-3" style={{ borderLeft: '4px solid #28a745', backgroundColor: 'var(--bg-secondary)' }}>
									<div className="card-body" style={{ padding: '12px' }}>
										<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
											<div>
												<strong style={{ color: '#28a745', fontSize: '14px' }}>🛒 Mua ban đầu</strong>
											</div>
											<div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
												{formatDate(order.purchaseDate)}
											</div>
										</div>
										<div style={{ fontSize: '13px', lineHeight: '1.6' }}>
											<div><strong>Gói:</strong> {originalPkgInfo?.package?.name || 'Không xác định'}</div>
											<div><strong>Giá:</strong> {formatPrice ? formatPrice(originalPrice) : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(originalPrice)}</div>
											<div><strong>Hạn sử dụng:</strong> {formatDate(originalExpiryDate)}</div>
											<div><strong>Thanh toán:</strong> {getPaymentLabel ? (getPaymentLabel(order.paymentStatus) || 'Chưa thanh toán') : paymentLabel}</div>
										</div>
									</div>
								</div>

								{/* Timeline: Các lần gia hạn */}
								{shouldCollapseRenewals && (
									<div
										style={{
											marginTop: '10px',
											fontSize: '13px',
											color: 'var(--text-secondary)',
											display: 'flex',
											justifyContent: 'space-between',
											alignItems: 'center',
											gap: '12px',
											flexWrap: 'wrap'
										}}
									>
										<span>
											{renewalsExpanded
												? `Đang hiển thị toàn bộ ${renewals.length} lần gia hạn`
												: `Đang hiển thị ${visibleRenewals.length}/${renewals.length} lần gia hạn gần nhất`}
										</span>
										<button
											type="button"
											className="btn btn-link p-0"
											style={{ fontSize: '13px', textDecoration: 'underline' }}
											onClick={() => setRenewalsExpanded(v => !v)}
										>
											{renewalsExpanded
												? 'Thu gọn'
												: `Xem thêm ${hiddenRenewalsCount} lần gia hạn trước đó`}
										</button>
									</div>
								)}
								{visibleRenewals.length > 0 && visibleRenewals.map((r, visibleIndex) => {
									const actualIndex = shouldCollapseRenewals && !renewalsExpanded
										? renewals.length - visibleRenewals.length + visibleIndex
										: visibleIndex;
									const prevPkgId = inferPreviousPackageId(actualIndex);
									const prevPkgInfo = getPackageInfo(prevPkgId || order.packageId);
									const newPkgInfo = getPackageInfo(r.packageId || order.packageId);
									// Giá gia hạn: luôn dùng r.price đã được lưu tại thời điểm gia hạn
									const renewalPrice = typeof r.price === 'number' ? r.price : 0;
									const renewalPriceFormatted = formatPrice
										? formatPrice(renewalPrice)
										: (renewalPrice > 0
											? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(renewalPrice)
											: '-');
									const paymentStatusLabel = getPaymentLabel ? getPaymentLabel(r.paymentStatus) : (PAYMENT_STATUSES.find(p => p.value === r.paymentStatus)?.label || '');
									const index = actualIndex;

									return (
										<div key={r.id} className="card mt-2" style={{ borderLeft: '4px solid #007bff', backgroundColor: 'var(--bg-secondary)' }}>
											<div className="card-body" style={{ padding: '12px' }}>
												<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
													<div>
														<strong style={{ color: '#007bff', fontSize: '14px' }}>🔄 Gia hạn lần {index + 1}</strong>
													</div>
													<div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
														{new Date(r.createdAt).toLocaleDateString('vi-VN')}
													</div>
												</div>
												<div style={{ fontSize: '13px', lineHeight: '1.6' }}>
													<div style={{ marginBottom: '6px' }}>
														<strong>Gói:</strong>
														<span style={{ marginLeft: '4px', color: 'var(--text-secondary)' }}>
															{prevPkgInfo?.package?.name || 'Không xác định'}
														</span>
														<span style={{ margin: '0 8px', color: '#007bff' }}>→</span>
														<span style={{ color: '#28a745', fontWeight: '500' }}>
															{newPkgInfo?.package?.name || 'Không xác định'}
														</span>
													</div>
													<div><strong>Thời gian gia hạn:</strong> +{r.months} tháng</div>
													<div><strong>Hạn sử dụng:</strong> {new Date(r.previousExpiryDate).toLocaleDateString('vi-VN')} → <span style={{ color: '#28a745', fontWeight: '500' }}>{new Date(r.newExpiryDate).toLocaleDateString('vi-VN')}</span></div>
													<div><strong>Giá gia hạn:</strong> {renewalPriceFormatted}</div>
													<div><strong>Thanh toán:</strong> {paymentStatusLabel}</div>
													{r.note && (
														<div style={{ marginTop: '6px', padding: '6px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '4px', fontSize: '12px' }}>
															<strong>Ghi chú:</strong> {r.note}
														</div>
													)}
												</div>
											</div>
										</div>
									);
								})}

								{renewals.length === 0 && (
									<div style={{ marginTop: '8px', padding: '8px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
										Chưa có lần gia hạn nào
									</div>
								)}
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
					{onOpenRenew && (order as any).paymentStatus !== 'REFUNDED' && (
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


