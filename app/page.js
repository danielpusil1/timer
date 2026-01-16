import Timer from './components/Timer';

export default function Home() {
  return (
    <main style={{
      width: '100%',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '20px'
    }}>
      <Timer />
    </main>
  );
}
