import './Button.css';

export default function Button({ href, children, onClick }) {
  return (
    <a className="button magnetic" href={href} onClick={onClick}>
      <span />
      {children}
    </a>
  );
}
