import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { signInWithRedirect } from 'aws-amplify/auth';
import { useAuthenticator, Authenticator } from '@aws-amplify/ui-react';
import { Container, Button, Stack } from '@mantine/core';
import logo from './assets/logo.svg';
import './App.css';
import './amplify-config';

function LoginScreen() {
  const { authStatus } = useAuthenticator();
  const handleLogin = () => {
    signInWithRedirect();
  };

  if (authStatus === 'authenticated') {
    return null; // This will be handled by the router
  }

  return (
    <Container size="xs" h="100vh">
      <Stack align="center" justify="center" h="100%">
        <img src={logo} alt="Gnome Trading Group Logo" className="logo" />
        <Button 
          size="sm" 
          onClick={handleLogin}
          variant='light'
        >
          Sign in with SSO
        </Button>
      </Stack>
    </Container>
  );
}

function HomeScreen() {
  const { user } = useAuthenticator();

  return (
    <div className="home-container">
      <h2>Welcome, {user.username}!</h2>
    </div>
  );
}

function AppContent() {
  const { authStatus } = useAuthenticator();

  return (
    <Router>
      <Routes>
        <Route path="/" element={
          authStatus === 'authenticated' 
            ? <HomeScreen />
            : <LoginScreen />
        } />
      </Routes>
    </Router>
  );
}

function App() {
  return (
    <Authenticator.Provider>
      <AppContent />
    </Authenticator.Provider>
  );
}

export default App;
