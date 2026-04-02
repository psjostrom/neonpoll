import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="container" style={{ paddingTop: "20vh" }}>
      <div className="sun" />
      <h1 className="title">NEONPOLL</h1>
      <p className="subtitle">PICK YOUR DATES. RETRO STYLE.</p>
      <div className="landing-cta">
        <Link href="/create" className="btn-primary">
          CREATE A POLL
        </Link>
      </div>
    </div>
  );
}
