import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import KOTManagement from './KOTManagement';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <KOTManagement />
  </StrictMode>
);
