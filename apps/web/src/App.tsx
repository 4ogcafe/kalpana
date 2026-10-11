import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import About from './pages/About';
import Contact from './pages/Contact';
import Menu from './pages/Menu';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import './index.css';

function AppContent() {
  const location = useLocation();
  const hideNavAndFooter = location.pathname === '/login' || location.pathname === '/admin';

  return (
    <div className="antialiased">
      {!hideNavAndFooter && <Navbar />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/menu/:type" element={<Menu />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
      {!hideNavAndFooter && <Footer />}
    </div>
  );
}

function App() {
  return (
    <Router>
      <Toaster position="top-right" />
      <AppContent />
    </Router>
  );
}

export default App;
