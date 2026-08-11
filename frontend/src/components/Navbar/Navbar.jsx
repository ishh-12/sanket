import { useState } from 'react';
import './Navbar.css';

const navItems = [
  { label: 'PROJECT', href: '#project' },
  { label: 'SYSTEM', href: '#works' },
  { label: 'DEMO', href: '#demo' },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="nav">
      <a className="brand" href="#hero" aria-label="SANKET home">
        <span />
        SANKET
      </a>
      <nav className="desktop-nav" aria-label="Primary navigation">
        {navItems.map((item) => (
          <a key={item.href} href={item.href}>{item.label}</a>
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
          <a key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}</a>
        ))}
      </nav>
      <p className="online"><span />SYSTEM ONLINE</p>
    </header>
  );
}
