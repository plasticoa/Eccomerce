import Image from "next/image";
import Link from "next/link";
import { getStorageAssetUrl } from "@/features/settings/settings-utils";

export function HomeBanners({banners=[]}){
  if(!banners.length)return null;
  return <section className="shell home-banners" aria-label="Promociones destacadas">{banners.map((banner,index)=><article key={banner.id}><Image src={getStorageAssetUrl("banners",banner.image_url)} alt={banner.title} fill sizes="(max-width: 760px) 100vw, 1120px" priority={index===0}/><div><p>{banner.subtitle}</p><h2>{banner.title}</h2>{banner.button_text&&banner.link_url?<Link className="button button-primary" href={banner.link_url}>{banner.button_text}</Link>:null}</div></article>)}</section>;
}
