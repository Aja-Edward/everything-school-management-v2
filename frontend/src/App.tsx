import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
      <ToastContainer position="top-right" autoClose={3000} />
    </ErrorBoundary>
  );
}

export default App;