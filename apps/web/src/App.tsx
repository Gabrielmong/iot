import { ApolloProvider } from '@apollo/client/react'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { MotionConfig } from 'framer-motion'
import { useState } from 'react'
import { BrowserRouter } from 'react-router'
import { createApolloClient } from './apollo'
import { AppRoutes } from './AppRoutes'
import { theme } from './theme'

export default function App() {
  const [client] = useState(createApolloClient)
  return (
    <ApolloProvider client={client}>
      <ThemeProvider theme={theme} defaultMode="dark">
        <CssBaseline enableColorScheme />
        {/* Movement is dropped (fades kept) for people who ask the OS for reduced motion. */}
        <MotionConfig reducedMotion="user">
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </MotionConfig>
      </ThemeProvider>
    </ApolloProvider>
  )
}
