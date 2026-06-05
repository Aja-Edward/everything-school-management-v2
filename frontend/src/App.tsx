// import { RouterProvider } from 'react-router-dom';
// import { router } from './routes';
// import { ToastContainer } from 'react-toastify';
// import 'react-toastify/dist/ReactToastify.css';
// import './App.css';
// import ErrorBoundary from './components/ErrorBoundary';

// function App() {
//   return (
//     <ErrorBoundary>
//       <RouterProvider router={router} />
//       <ToastContainer position="top-right" autoClose={3000} />
//     </ErrorBoundary>
//   );
// }

// export default App;

import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import ErrorBoundary from './components/ErrorBoundary';
import { TenantProvider, useTenant } from '@/contexts/TenantContext';

function AppInner() {
  const { isLoading } = useTenant();

  if (isLoading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
        <div style={{ width:32, height:32, borderRadius:'50%', border:'3px solid #e0e7ff', borderTopColor:'#4f46e5', animation:'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return <RouterProvider router={router} />;
}

function App() {
  return (
    <ErrorBoundary>
      <TenantProvider>
        <AppInner />
        <ToastContainer position="top-right" autoClose={3000} />
      </TenantProvider>
    </ErrorBoundary>
  );
}

export default App;