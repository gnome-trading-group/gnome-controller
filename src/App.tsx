import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { signInWithRedirect } from 'aws-amplify/auth';
import './App.css';
import './amplify-config';

function LoginScreen() {
  const handleLogin = () => {
    signInWithRedirect();
  };

  return (
    <div className="login-container">
      <button onClick={handleLogin}>Sign in with SSO</button>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginScreen />} />
      </Routes>
    </Router>
  );
}

export default App;
