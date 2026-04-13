import React from 'react';
import './footer.css';

export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterSocialLink {
  /** スクリーンリーダー向けラベル */
  label: string;
  href: string;
  icon: React.ReactNode;
}

export interface FooterProps {
  /** 下層：コピーライトテキスト（必須） */
  copyright: string;
  /** 上層：ナビ・規約リンク群（省略時は上層非表示） */
  topLinks?: FooterLink[];
  /** 中間層：ソーシャルリンク群（省略時は中間層非表示） */
  socialLinks?: FooterSocialLink[];
  /** 中間層：連絡先テキスト */
  contactText?: string;
  /** 中間層：連絡先リンク href */
  contactHref?: string;
}

export function Footer({
  copyright,
  topLinks,
  socialLinks,
  contactText,
  contactHref,
}: FooterProps) {
  const hasTop    = topLinks && topLinks.length > 0;
  const hasMiddle = (socialLinks && socialLinks.length > 0) || !!contactText;

  return (
    <footer className="osahou-footer">
      <div className="osahou-footer__inner">

        {hasTop && (
          <div className="osahou-footer__top">
            {topLinks!.map((link) => (
              <a key={link.href} href={link.href} className="osahou-footer__top-link">
                {link.label}
              </a>
            ))}
          </div>
        )}

        {hasMiddle && (
          <div className="osahou-footer__middle">
            {contactText && (
              <a
                href={contactHref ?? `mailto:${contactText}`}
                className="osahou-footer__contact"
              >
                {contactText}
              </a>
            )}
            {socialLinks && socialLinks.length > 0 && (
              <div className="osahou-footer__social">
                {socialLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="osahou-footer__social-link"
                    aria-label={link.label}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {link.icon}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="osahou-footer__bottom">
          <p className="osahou-footer__copyright">{copyright}</p>
        </div>

      </div>
    </footer>
  );
}
