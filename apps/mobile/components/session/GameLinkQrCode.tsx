import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
// Core only — avoids Node canvas/png paths that break in React Native.
import QRCode from 'qrcode/lib/core/qrcode'

type Props = {
  url: string
  size?: number
}

/** QR rendered with plain Views — avoids react-native-svg layout events in Expo Go. */
export function GameLinkQrCode({ url, size = 152 }: Props) {
  const [modules, setModules] = useState<boolean[] | null>(null)
  const [moduleCount, setModuleCount] = useState(0)

  useEffect(() => {
    try {
      const qr = QRCode.create(url, { errorCorrectionLevel: 'M' })
      const count = qr.modules.size
      const data: boolean[] = []
      for (let y = 0; y < count; y++) {
        for (let x = 0; x < count; x++) {
          data.push(!!qr.modules.get(x, y))
        }
      }
      setModuleCount(count)
      setModules(data)
    } catch {
      setModuleCount(0)
      setModules(null)
    }
  }, [url])

  const cellSize = moduleCount > 0 ? size / moduleCount : 0

  if (!modules || moduleCount === 0) {
    return (
      <View style={[styles.frame, styles.placeholder, { width: size + 24, height: size + 24 }]}>
        <ActivityIndicator color="#f43f5e" />
      </View>
    )
  }

  return (
    <View style={styles.frame}>
      <View style={{ width: size, height: size, backgroundColor: '#ffffff' }}>
        {Array.from({ length: moduleCount }, (_, y) => (
          <View key={y} style={{ flexDirection: 'row', height: cellSize }}>
            {Array.from({ length: moduleCount }, (_, x) => (
              <View
                key={x}
                style={{
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: modules[y * moduleCount + x] ? '#000000' : '#ffffff',
                }}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
