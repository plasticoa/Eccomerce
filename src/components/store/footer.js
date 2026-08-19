import Link from "next/link";

export function StoreFooter({ settings }) {
  const contact=settings?.contact||{};const social=Object.entries(settings?.socialLinks||{}).filter(([,url])=>url);const links=(settings?.footer?.links||[]).filter((link)=>link?.label&&link?.url);
  return (
    <footer className="store-footer">
      <div className="shell footer-dynamic">
        <div><strong>{settings?.storeName||"Importadora Valiente"}</strong>{settings?.footer?.description?<p>{settings.footer.description}</p>:null}</div>
        {(contact.phone||contact.whatsapp||contact.email||contact.address||contact.hours)?<address><strong>Contacto</strong>{contact.phone?<a href={`tel:${contact.phone}`}>{contact.phone}</a>:null}{contact.whatsapp?<a href={`https://wa.me/${contact.whatsapp.replace(/\D/g,"")}`}>WhatsApp {contact.whatsapp}</a>:null}{contact.email?<a href={`mailto:${contact.email}`}>{contact.email}</a>:null}{contact.address?<span>{contact.address}</span>:null}{contact.hours?<span>{contact.hours}</span>:null}</address>:null}
        {links.length?<nav aria-label="Enlaces del pie">{links.map((link)=><Link href={link.url} key={`${link.label}-${link.url}`}>{link.label}</Link>)}</nav>:null}
        {social.length?<nav aria-label="Redes sociales">{social.map(([name,url])=><a href={url} target="_blank" rel="noreferrer" key={name}>{name}</a>)}</nav>:null}
      </div>
    </footer>
  );
}
