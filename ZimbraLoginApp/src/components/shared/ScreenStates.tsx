import React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
} from 'react-native';
import ActionButton from './ActionButton';
import { COLORS } from './commonStyles';

type LoadingStateProps = {
  message: string;
  spinnerColor?: string;
};

type ErrorStateProps = {
  message: string;
  onRetry: () => void;
  retryLabel?: string;
  accentColor?: string;
};

type EmptyStateMessageProps = {
  message: string;
  style?: StyleProp<TextStyle>;
};

export const LoadingState: React.FC<LoadingStateProps> = ({
  message,
  spinnerColor = '#1f6feb',
}) => (
  <View style={styles.centered}>
    <ActivityIndicator size="large" color={spinnerColor} />
    <Text style={styles.message}>{message}</Text>
  </View>
);

export const ErrorState: React.FC<ErrorStateProps> = ({
  message,
  onRetry,
  retryLabel = 'Retry',
  accentColor = '#1f6feb',
}) => (
  <View style={styles.centered}>
    <Text style={styles.errorMessage}>{message}</Text>
    <ActionButton
      label={retryLabel}
      onPress={onRetry}
      backgroundColor={accentColor}
      style={styles.retryButton}
    />
  </View>
);

export const EmptyStateMessage: React.FC<EmptyStateMessageProps> = ({
  message,
  style,
}) => <Text style={[styles.message, style]}>{message}</Text>;

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    fontSize: 15,
    color: COLORS.textMuted,
    marginTop: 12,
    textAlign: 'center',
  },
  errorMessage: {
    color: COLORS.danger,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 14,
  },
  retryButton: {
    minWidth: 96,
  },
});
