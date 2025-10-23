import React from 'react';
import { useEffect, useState } from 'react';
import { Order, PaymentStatus, PAYMENT_STATUSES, WARRANTY_STATUSES } from '../../types';
import { Database } from '../../utils/database';
import { getSupabase } from '../../utils/supabaseClient';

type Getters = {
	getCustomerName: (customerId: string) => string;
	getPackageInfo: (packageId: string) => { package?: any; product?: any } | null;
	getStatusLabel: (status: any) => string;
	getPaymentLabel?: (status: any) => string;
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
}

const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({
	order,
	onClose,
	inventory,
	products,
	packages,
	getCustomerName,
	getPackageInfo,
	getStatusLabel,
	getPaymentLabel,
	formatDate,
	formatPrice,
	onCopyInfo,
	onOpenRenew
}) => {
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
		return () => { try { ch.unsubscribe(); } catch {} };
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [order.id]);
	const pkgInfo = getPackageInfo(order.packageId);
	const paymentLabel = (PAYMENT_STATUSES.find(p => p.value === (order as any).paymentStatus)?.label) || 'Chưa thanh toán';

	const findInventory = () => {
		// First try to find by inventoryItemId if it exists
		if ((order as any).inventoryItemId) {
			const found = inventory.find(i => i.id === (order as any).inventoryItemId);
			if (found) return found;
		}
		// Fallback 1: find by linkedOrderId (classic single-item link)
		const byLinked = inventory.find(i => i.linked_order_id === order.id || i.linkedOrderId === order.id);
		if (byLinked) return byLinked;
		// Fallback 2: account-based items where a profile is assigned to this order
		return inventory.find(i => i.is_account_based || i.isAccountBased
			? (i.profiles || []).some((p: any) => p.assignedOrderId === order.id)
			: false);
	};

	const inv = findInventory();

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
		return (
			<div className="card mt-2">
				<div className="card-header">
					<strong>📦 Thông tin kho hàng</strong>
				</div>
				<div className="card-body">
					<div className="row">
						<div className="col-md-6">
							<div className="mb-2">
								<strong>Mã kho:</strong> <span className="badge bg-primary">{inv.code}</span>
							</div>
							<div className="mb-2">
								<strong>Sản phẩm:</strong> <span className="text-primary fw-bold">{productName}</span>
							</div>
							<div className="mb-2">
								<strong>Gói/Pool:</strong>
								<span className="badge bg-info ms-1">
									{isSharedPool ? 'Pool chung' : packageName}
								</span>
							</div>
							<div className="mb-2">
								<strong>Trạng thái:</strong>
								<span className={`badge ms-1 ${
									inv.status === 'AVAILABLE' ? 'bg-success' :
									inv.status === 'SOLD' ? 'bg-danger' :
									inv.status === 'RESERVED' ? 'bg-warning' : 'bg-secondary'
								}` }>
									{inv.status === 'AVAILABLE' ? 'Có sẵn' :
									inv.status === 'SOLD' ? 'Đã bán' :
									inv.status === 'RESERVED' ? 'Đã giữ' : inv.status}
								</span>
							</div>
							<div className="mb-2">
								<strong>Ngày nhập:</strong> {inv.purchaseDate ? new Date(inv.purchaseDate).toLocaleDateString('vi-VN') : 'N/A'}
							</div>
							<div className="mb-2">
								<strong>Hạn sử dụng:</strong> {inv.expiryDate ? new Date(inv.expiryDate).toLocaleDateString('vi-VN') : 'N/A'}
							</div>
						</div>
						<div className="col-md-6">
							{typeof inv.purchasePrice === 'number' && (
								<div className="mb-2">
									<strong>Giá nhập:</strong>
									<span className="text-success fw-bold">
										{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(inv.purchasePrice)}
									</span>
								</div>
							)}
							{inv.sourceNote && (
								<div className="mb-2">
									<strong>Nguồn nhập:</strong> <em>{inv.sourceNote}</em>
								</div>
							)}
							{(inv.isAccountBased || inv.is_account_based) && (
								<div className="mb-2">
									<strong>Loại:</strong> <span className="badge bg-info">Tài khoản nhiều slot</span>
								</div>
							)}
								{linkedSlots.length > 0 && (
									<div className="mb-2">
										<strong>Slot liên kết:</strong> {linkedSlots.join(', ')}
									</div>
								)}
							{inv.notes && (
								<div className="mb-2">
									<strong>Ghi chú:</strong> <small className="text-muted">{inv.notes}</small>
								</div>
							)}
						</div>
					</div>
					{inv.productInfo && (
						<div className="mt-3">
							<strong>Thông tin sản phẩm:</strong>
								<div className="mt-1 p-2 bg-light rounded">
									<pre className="mb-0 small" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{inv.productInfo}</pre>
								</div>
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
							<div key={cf.id} className="mb-3">
								<div><strong>{cf.title}:</strong></div>
								<div className="mt-1 p-2 bg-light rounded">
									<pre className="mb-0 small" style={{ whiteSpace: 'pre-wrap' }}>{String(value).trim()}</pre>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		);
	};

	const renderAccountOrderInfo = () => {
		if (!inv) return null;
		const packageInfo = packages.find((p: any) => p.id === inv.packageId);
		const accountColumns = (packageInfo?.accountColumns || inv.accountColumns || []) as any[];
		const displayColumns = accountColumns.filter(col => col.includeInOrderInfo);
		if (displayColumns.length === 0) return null;
		return (
			<div className="card mt-2">
				<div className="card-header">
					<strong>📋 Thông tin đơn hàng</strong>
				</div>
				<div className="card-body">
					{displayColumns.map(col => {
						const value = (inv.accountData || {})[col.id] || '';
						if (!String(value).trim()) return null;
						return (
							<div key={col.id} className="mb-3">
								<div><strong>{col.title}:</strong></div>
									<div className="mt-1 p-2 bg-light rounded">
										<pre className="mb-0 small" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{value}</pre>
									</div>
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
					<div><strong>Khách hàng:</strong> {getCustomerName(order.customerId)}</div>
					<div><strong>Sản phẩm:</strong> {pkgInfo?.product?.name || 'Không xác định'}</div>
					<div><strong>Gói:</strong> {pkgInfo?.package?.name || 'Không xác định'}</div>
					<div><strong>Ngày mua:</strong> {formatDate(order.purchaseDate)}</div>
					<div><strong>Ngày hết hạn:</strong> {formatDate(order.expiryDate)}</div>
					<div><strong>Trạng thái:</strong> {getStatusLabel(order.status)}</div>
					<div><strong>Thanh toán:</strong> {getPaymentLabel ? (getPaymentLabel(order.paymentStatus) || 'Chưa thanh toán') : paymentLabel}</div>

					{renderInventoryCard()}
					{renderAccountOrderInfo()}
					{renderCustomFields()}
					{order.notes && <div><strong>Ghi chú:</strong> {order.notes}</div>}
					{(() => {
						// warrantyTick is used only to force recalculation on realtime events
						void warrantyTick;
						const list = Database.getWarrantiesByOrder(order.id);
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
				<div className="d-flex justify-content-end gap-2">
					{new Date(order.expiryDate) >= new Date() && onOpenRenew && (
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


