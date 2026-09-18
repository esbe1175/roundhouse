import Roundhouse from './pages/Roundhouse';
import SettingsProvider from './providers/SettingsProvider';
import ErrorBoundary from './components/ErrorBoundary';
export default function App() {return <ErrorBoundary><SettingsProvider><Roundhouse /></SettingsProvider></ErrorBoundary>;}
