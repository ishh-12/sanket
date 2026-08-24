import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home/Home';
import Dashboard from './pages/Dashboard/Dashboard';
import Diagnosis from './pages/Diagnosis/Diagnosis';
import Storage from './pages/Storage/Storage';
import Health from './pages/Health/Health';
import Healing from './pages/Healing/Healing';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/diagnosis" element={<Diagnosis />} />
        <Route path="/storage" element={<Storage />} />
        <Route path="/health" element={<Health />} />
        <Route path="/healing" element={<Healing />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
