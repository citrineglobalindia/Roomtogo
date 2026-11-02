import Script from "next/script";
import { ConsentBanner, ContactClickTracker, MobileBookBar } from "@/components/site/client-bits";
import { DemoBanner, SiteFooter } from "@/components/site/chrome";
import { SiteHeader } from "@/components/site/header";
import { analyticsConfig } from "@/lib/config";
import { getSiteInfo } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const info = await getSiteInfo();
  const a = analyticsConfig();
  return (
    <>
      {info.demo && <DemoBanner />}
      <SiteHeader />
      <main id="main" className="pb-20 sm:pb-0">
        {children}
      </main>
      <SiteFooter info={info} />
      <MobileBookBar phoneHref={info.phoneHref} whatsappHref={info.whatsappHref} />
      <ContactClickTracker />
      <ConsentBanner enabled={info.analytics} />
      {a.provider === "ga4" && a.ga4Id && (
        <Script id="ga4" strategy="afterInteractive">{`
          window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)};window.gtag=gtag;
          var c=null;try{c=localStorage.getItem('r2g_analytics_consent')}catch(e){}
          gtag('consent','default',{analytics_storage:c==='granted'?'granted':'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
          if(c==='granted'){var s=document.createElement('script');s.async=1;s.src='https://www.googletagmanager.com/gtag/js?id=${a.ga4Id}';document.head.appendChild(s);gtag('js',new Date());gtag('config','${a.ga4Id}',{anonymize_ip:true});}
        `}</Script>
      )}
    </>
  );
}
