import React, { useState, useEffect, Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { NotificationProvider } from './contexts/NotificationContext';
import LoginForm from './components/Auth/LoginForm';
import Header from './components/Layout/Header';
import Sidebar from './components/Layout/Sidebar';
const ProductList = lazy(() => import('./components/Products/ProductList'));
const PackageList = lazy(() => import('./components/Products/PackageList'));
const WarehouseList = lazy(() => import('./components/Products/WarehouseList'));
const CustomerList = lazy(() => import('./components/Customers/CustomerList'));
const OrderList = lazy(() => import('./components/Orders/OrderList'));
// removed EmployeeList and UserManagement per requirements
import ActivityLogList from './components/ActivityLogs/ActivityLogList';
const WarrantyList = lazy(() => import('./components/Orders/WarrantyList'));
const Dashboard = lazy(() => import('./components/Dashboard/Dashboard'));
const ExpenseList = lazy(() => import('./components/Expenses/ExpenseList'));
import { getSupabase } from './utils/supabaseClient';

const AppContent: React.FC = () => {
  const { state } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    // Supabase-only mode: no local/demo seeding
  }, []);

  if (!state.isAuthenticated) {
    return <LoginForm />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'products':
        return <ProductList />;
      case 'packages':
        return <PackageList />;
      case 'warehouse':
        return <WarehouseList />;
      case 'customers':
        return <CustomerList />;
      case 'orders':
        return <OrderList />;
      case 'warranties':
        return <WarrantyList />;
      // employees and user-management removed
      case 'activity-logs':
        return <ActivityLogList />;
      case 'expenses':
        return <ExpenseList />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div>
      <Header />
      <div className="container">
        <div className="layout">
          <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
          <div className="main-content">
            <Suspense fallback={<div>Đang tải...</div>}>
              {renderContent()}
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <ToastProvider>
            <AppContent />
          </ToastProvider>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;