import Navbar from '../../components/Navbar/Navbar';
import './Dashboard.css';

export default function Dashboard() {
  return (
    <div className="page-shell">
      <Navbar />
      <main className="page-content">
        <h1>Dashboard</h1>
        <p>Welcome to the SANKET dashboard. This page is a placeholder for analytics and system health.</p>
      </main>
    </div>
  );
}
