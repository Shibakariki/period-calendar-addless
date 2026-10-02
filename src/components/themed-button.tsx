import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

export type ThemedButtonProps = PressableProps & {
  label: string;
  type?: 'primary' | 'secondary' | 'ghost';
  themeColor?: ThemeColor;
};

export function ThemedButton({ label, type = 'primary', themeColor, style, ...rest }: ThemedButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      style={(state) => [
        styles.base,
        type === 'primary' && { backgroundColor: theme[themeColor ?? 'backgroundSelected'] },
        type === 'secondary' && { backgroundColor: theme['backgroundElement'] },
        type === 'ghost' && styles.ghost,
        state.pressed && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}
    >
      <ThemedText
        type="smallBold"
        themeColor={themeColor ?? 'text'}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginVertical: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  pressed: {
    opacity: 0.7,
  },
});
