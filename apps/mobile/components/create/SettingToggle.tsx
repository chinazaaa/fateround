import { StyleSheet, Switch, Text, View } from 'react-native'
import { theme } from '@/constants/theme'

type Props = {
  label: string
  description?: string
  value: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}

export function SettingToggle({ label, description, value, onChange, disabled }: Props) {
  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: theme.border, true: theme.primarySoft }}
        thumbColor={value ? theme.primary : theme.textMuted}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.md,
    paddingVertical: 4,
  },
  disabled: { opacity: 0.45 },
  copy: { flex: 1, gap: 2 },
  label: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '700',
  },
  description: {
    color: theme.textFaint,
    fontSize: 12,
    lineHeight: 17,
  },
})
