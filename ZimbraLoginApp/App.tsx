import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ApolloProvider } from '@apollo/client/react';
import { Provider } from 'react-redux';
import client from './src/apolloClient';
import Login from './src/components/Login';
import Home from './src/components/Home';
import store from './src/store/store';
import { useAppSelector } from './src/store/hooks';
import { logout } from './src/store/authSlice';

const AppContent = () => {
  const isLoggedIn = useAppSelector((state) => state.auth.isLoggedIn);

  const handleLogout = () => {
    store.dispatch(logout());
  };

  return (
    <View style={styles.container}>
      {isLoggedIn ? (
        <Home onLogout={handleLogout} />
      ) : (
        <Login />
      )}
    </View>
  );
};

const App = () => {
  return (
    <Provider store={store}>
      <ApolloProvider client={client}>
        <AppContent />
      </ApolloProvider>
    </Provider>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});

export default App;
