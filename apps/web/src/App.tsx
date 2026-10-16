import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import Home from './pages/Home';
import { CartProvider } from './lib/cart';
import { CustomerProvider } from './lib/customer';
import CartDrawer from './components/order/CartDrawer';
import './index.css';

// Home is the usual landing page, so it ships in the main bundle; everything else loads on demand.
// The admin dashboard is its own chunk and is never downloaded by public visitors.
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));
const Menu = lazy(() => import('./pages/Menu'));
const Order = lazy(() => import('./pages/Order'));
const OrderStatus = lazy(() => import('./pages/OrderStatus'));
const Account = lazy(() => import('./pages/Account'));
const AccountAuth = lazy(() => import('./pages/AccountAuth'));
const Login = lazy(() => import('./pages/Login'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const Kitchen = lazy(() => import('./pages/Kitchen'));
const NotFound = lazy(() => import('./pages/NotFound'));

function AppContent() {
  const location = useLocation();
  // The admin, kitchen and member dashboards have their own navigation.
  const hideNavAndFooter = ['/login', '/admin', '/kitchen', '/account'].includes(location.pathname);

  return (
    <div className="antialiased">
      {!hideNavAndFooter && <Navbar />}
      <Suspense fallback={<div style={{ minHeight: '60vh' }} aria-busy="true" />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/menu/:type" element={<Menu />} />
          <Route path="/order" element={<Order />} />
          <Route path="/order/:token" element={<OrderStatus />} />
          <Route path="/account" element={<Account />} />
          <Route path="/account/login" element={<AccountAuth mode="login" />} />
          <Route path="/account/register" element={<AccountAuth mode="register" />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/kitchen" element={<Kitchen />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <CartDrawer />
      {!hideNavAndFooter && <Footer />}
    </div>
  );
}

function App() {
  return (
    <Router>
      <ScrollToTop />
      {/* Top center, so toasts never cover the header cart icon on the right. */}
      <Toaster position="top-center" />
      <CustomerProvider>
        <CartProvider>
          <AppContent />
        </CartProvider>
      </CustomerProvider>
    </Router>
  );
}

export default App;
