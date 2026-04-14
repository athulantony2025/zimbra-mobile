import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useMutation } from '@apollo/client/react';
import { useAppDispatch } from '../store/hooks';
import { login } from '../store/authSlice';
import { LOGIN_MUTATION } from '../graphql/mutations';

const Login: React.FC = () => {
  const dispatch = useAppDispatch();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [trustedDeviceToken, setTrustedDeviceToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [loginMutation] = useMutation(LOGIN_MUTATION);

  const buildAuthInput = (code?: string) => ({
    account: {
      accountBy: 'name',
      key: username
    },
    password,
    tokenType: 'JWT',
    isCsrfSupported: true,
    twoFactorCode: code,
    trustedDeviceToken: trustedDeviceToken || undefined,
    isDeviceTrusted: false,
    doPersistCookie: true
  });

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Please enter both username and password');
      return;
    }

    setErrorMessage(null);
    setLoading(true);

    try {
      const { data } = await loginMutation({
        variables: {
          authInput: buildAuthInput()
        }
      });

      console.log(JSON.stringify(data))

      const authData = (data as any).authenticate;
      const authToken = authData?.authToken ?? null;
      const csrfToken = authData?.csrfToken ?? null;

      if (authToken && csrfToken) {
        dispatch(login({ authToken, csrfToken }));
        return;
      }

      if (authToken && authData?.twoFactorAuthRequired !== 'TRUE') {
        dispatch(login({ authToken, csrfToken }));
        return;
      }

      if (authData?.resetPassword === 'TRUE') {
        Alert.alert('Password Reset Required', 'Password reset is required');
        setLoading(false);
        return;
      }

      if (authData?.twoFactorAuthRequired === 'TRUE') {
        if (authData?.trustedToken) {
          setTrustedDeviceToken(authData.trustedToken);
        }
        setTwoFactorRequired(true);
        setLoading(false);
        return;
      }

      Alert.alert('Login Error', 'Authentication failed. Please check your credentials.');
      setErrorMessage('Authentication failed. Please check your username and password.');
    } catch (err: any) {
      Alert.alert('Login Error', err.message || 'Login failed');
      setErrorMessage(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handle2FA = async () => {
    if (!twoFactorCode) {
      Alert.alert('Error', 'Please enter the 2FA code');
      return;
    }

    setErrorMessage(null);
    setLoading(true);

    try {
      const { data } = await loginMutation({
        variables: {
          authInput: buildAuthInput(twoFactorCode)
        }
      });

      const authData = (data as any).authenticate;
      const authToken = authData?.authToken ?? null;
      const csrfToken = authData?.csrfToken ?? null;

      if (authToken && csrfToken) {
        dispatch(login({ authToken, csrfToken }));
        return;
      }

      if (authData?.resetPassword === 'TRUE') {
        Alert.alert('Password Reset Required', 'Password reset is required');
        setLoading(false);
        return;
      }

      if (authData?.twoFactorAuthRequired === 'TRUE') {
        const message = 'Invalid 2FA code. Please try again.';
        Alert.alert('2FA Error', message);
        setErrorMessage(message);
        setLoading(false);
        return;
      }

      const fallbackMessage = '2FA verification failed. Please try again.';
      Alert.alert('2FA Error', fallbackMessage);
      setErrorMessage(fallbackMessage);
    } catch (err: any) {
      const message = err.message || '2FA login failed';
      Alert.alert('2FA Error', message);
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setTwoFactorRequired(false);
    setTwoFactorCode('');
    setTrustedDeviceToken(null);
    setErrorMessage(null);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Zimbra Login</Text>

      {!twoFactorRequired ? (
        <>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Username/Email:</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="Enter username or email"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!loading}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password:</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                secureTextEntry={!showPassword}
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword((prev) => !prev)}
                disabled={loading}
              >
                <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Login</Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Two-factor code</Text>
            <TextInput
              style={styles.input}
              value={twoFactorCode}
              onChangeText={setTwoFactorCode}
              placeholder="Enter 6-digit code"
              keyboardType="number-pad"
              maxLength={6}
              editable={!loading}
            />
            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handle2FA}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Verify 2FA</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.linkButton, loading && styles.buttonDisabled]}
            onPress={handleReset}
            disabled={loading}
          >
            <Text style={styles.linkText}>Back to login</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f5f5f5' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 30, color: '#333' },
  inputContainer: { marginBottom: 20 },
  label: { fontSize: 16, fontWeight: '500', marginBottom: 8, color: '#333' },
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, marginRight: 10 },
  eyeButton: { paddingVertical: 12, paddingHorizontal: 10 },
  eyeText: { color: '#007bff', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#fff' },
  button: { backgroundColor: '#007bff', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  buttonDisabled: { backgroundColor: '#ccc' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  linkButton: { marginTop: 12, alignItems: 'center' },
  linkText: { color: '#007bff', fontWeight: '600' },
  errorText: { color: '#cc0000', marginTop: 10, textAlign: 'center' }
});

export default Login;