import React from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { COLORS } from './commonStyles';

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

const ActionButton: React.FC<ActionButtonProps> = ({
  label,
  onPress,
  backgroundColor,
  style,
  labelStyle,
}) => (
  <TouchableOpacity
    style={[styles.button, backgroundColor ? { backgroundColor } : null, style]}
    onPress={onPress}
  >
    <Text style={[styles.buttonText, labelStyle]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '600',
  },
});

export default ActionButton;
