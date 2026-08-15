import { Link } from 'react-router-dom';
import mascot from '../assets/turboham-evolution.gif';

export default function NotFound() {
  return (
    <section className="centre-block">
      {/* Room for the full animation here, unlike the header. */}
      <img className="hero-mascot" src={mascot} width={210} height={203} alt="" />
      <h1>Nothing here</h1>
      <p className="muted">TurboHam checked behind the wheel. That page does not exist.</p>
      <Link className="button" to="/">
        Back to the start
      </Link>
    </section>
  );
}
