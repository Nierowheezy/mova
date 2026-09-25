import { Link } from "react-router-dom";

const NotFoundPage = () => {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "var(--bg)", color: "var(--text)" }}>
            <div className="card card-pad flex flex-col items-center max-w-md w-full" style={{ padding: "var(--sp-10)" }}>
                <div className="mono display" style={{ color: "var(--text)" }}>404</div>
                <h1 className="h2" style={{ marginTop: "var(--sp-3)" }}>Page Not Found</h1>
                <p className="small subdued" style={{ marginTop: "var(--sp-2)", textAlign: "center" }}>
                    Sorry, the page you are looking for does not exist or has been moved.
                </p>
                <Link to="/" className="btn btn-primary" style={{ marginTop: "var(--sp-6)", textDecoration: "none" }}>
                    Go Home
                </Link>
            </div>
            <div className="xsmall faint" style={{ marginTop: "var(--sp-6)" }}>
                © {new Date().getFullYear()} Mova
            </div>
        </div>
    );
};

export default NotFoundPage;