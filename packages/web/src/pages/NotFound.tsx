import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section className="centre-block">
      <span className="mascot mascot-md" aria-hidden="true" />
      <h1>Nothing here</h1>
      <p className="muted">TurboHam checked behind the wheel. That page does not exist.</p>
      <Link className="button" to="/">
        Back to the start
      </Link>
    </section>
  );
}
