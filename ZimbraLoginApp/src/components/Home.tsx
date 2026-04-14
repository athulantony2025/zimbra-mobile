import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';

interface HomeProps {
  onLogout: () => void;
}

const Home: React.FC<HomeProps> = ({ onLogout }) => {
  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: onLogout
      }
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to Zimbra!</Text>
      <Text style={styles.subtitle}>You are successfully logged in.</Text>
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#f5f5f5' },
  title: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 10, color: '#333' },
  subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 40, color: '#666' },
  logoutButton: { backgroundColor: '#dc3545', padding: 15, borderRadius: 8, width: '100%', alignItems: 'center' },
  logoutButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});

export default Home;