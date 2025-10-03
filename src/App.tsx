import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { NotificationProvider } from './contexts/NotificationContext';
import LoginForm from './components/Auth/LoginForm';
import Header from './components/Layout/Header';
import Sidebar from './components/Layout/Sidebar';
import ProductList from './components/Products/ProductList';
import PackageList from './components/Products/PackageList';
import WarehouseList from './components/Products/WarehouseList';
import CustomerList from './components/Customers/CustomerList';
import OrderList from './components/Orders/OrderList';
// removed EmployeeList and UserManagement per requirements
import ActivityLogList from './components/ActivityLogs/ActivityLogList';
import WarrantyList from './components/Orders/WarrantyList';
import Dashboard from './components/Dashboard/Dashboard';
import ExpenseList from './components/Expenses/ExpenseList';
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
            {renderContent()}
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