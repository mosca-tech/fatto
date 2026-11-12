import LoginButton from './LoginButton';

const ERRORS = {
  non_autorizzato: 'Questo account Google non è autorizzato ad accedere.',
  accesso: 'Accesso non riuscito. Riprova.',
};

export default async function Login({ searchParams }) {
  const params = await searchParams;
  const error = ERRORS[params?.error];
  return (
    <main className="login">
      <div className="login-card">
        <h1 className="brand">Fatto</h1>
        <p className="note">La tua bacheca personale. Accedi con il tuo account Google.</p>
        {error ? <p className="login-error" role="alert">{error}</p> : null}
        <LoginButton />
      </div>
    </main>
  );
}
