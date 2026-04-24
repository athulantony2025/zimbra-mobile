import { StyleSheet } from 'react-native';

export const COLORS = {
  white: '#fff',
  textPrimary: '#1f2937',
  textSecondary: '#4b5563',
  textMuted: '#555',
  borderLight: '#ececec',
  primaryBlue: '#1f6feb',
  infoBlue: '#007bff',
  danger: '#c62828',
  destructive: '#dc3545',
} as const;

export const sharedStyles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 16,
  },
  list: {
    paddingBottom: 16,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
});
