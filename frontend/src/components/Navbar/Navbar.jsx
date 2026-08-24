import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import useDevice from '../../hooks/useDevice';
import './Navbar.css';

const navItems = [
  { label: 'PROJECT', href: '/', end: true },
  { label: 'DASHBOARD', href: '/dashboard' },
  { label: 'DIAGNOSIS', href: '/diagnosis' },
  { label: 'STORAGE', href: '/storage' },
  { label: 'HEALTH', href: '/health' },
  { label: 'HEALING', href: '/healing' },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { connected } = useDevice(30000);

  return (
    <header className="nav">
      <Link className="brand" to="/" aria-label="SANKET home">
        <span />
        SANKET
      </Link>
      <nav className="desktop-nav" aria-label="Primary navigation">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            end={item.end}
            className={({ isActive }) => (isActive ? 'active' : undefined)}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <button
        className="menu-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span />
        MENU
      </button>
      <nav className={`mobile-menu ${open ? 'open' : ''}`} id="mobile-menu" aria-label="Mobile navigation">
        {navItems.map((item) => (
          <NavLink key={item.href} to={item.href} end={item.end} onClick={() => setOpen(false)}>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <p className={`online ${connected ? '' : 'offline'}`}>
        <span />
        {connected ? 'SYSTEM ONLINE' : 'AGENT OFFLINE'}
      </p>
    </header>
  );
}
