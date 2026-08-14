"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AndroidOutlined,
  CheckCircleFilled,
  CopyOutlined,
  DownloadOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { Alert, Button, Empty, Skeleton, message } from "antd";
import { QRCodeSVG } from "qrcode.react";
import {
  AppRelease,
  appReleasesApi,
  getAppDownloadUrl,
} from "@/lib/api/app-releases";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { useTranslation } from "@/i18n/useTranslation";
import styles from "./app-download.module.css";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function AppDownloadPage() {
  const { t, locale } = useTranslation();
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void appReleasesApi
      .latest()
      .then(setRelease)
      .catch(() => message.error(t("appDownload.loadFailed")))
      .finally(() => setLoading(false));
  }, [t]);

  const downloadUrl = useMemo(
    () => (release ? getAppDownloadUrl(release) : ""),
    [release],
  );

  const copyLink = async () => {
    await navigator.clipboard.writeText(downloadUrl);
    message.success(t("appDownload.linkCopied"));
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>ALMS</span>
          <span>{t("appDownload.brand")}</span>
        </div>
        <LanguageSwitcher />
      </header>

      <section className={styles.hero}>
        <div className={styles.copy}>
          <div className={styles.eyebrow}>
            <span className={styles.liveDot} />
            {t("appDownload.officialRelease")}
          </div>
          <h1>{t("appDownload.title")}</h1>
          <p>{t("appDownload.subtitle")}</p>

          {loading ? (
            <Skeleton active paragraph={{ rows: 5 }} />
          ) : !release ? (
            <div className={styles.empty}>
              <Empty description={t("appDownload.noRelease")} />
            </div>
          ) : (
            <>
              <div className={styles.versionLine}>
                <span className={styles.platformBadge}>
                  <AndroidOutlined /> Android
                </span>
                <strong>v{release.versionName}</strong>
                <span>Build {release.versionCode}</span>
                <span>{formatBytes(release.fileSize)}</span>
              </div>

              <div className={styles.actions}>
                <Button
                  type="primary"
                  size="large"
                  icon={<DownloadOutlined />}
                  href={downloadUrl}
                >
                  {t("appDownload.downloadApk")}
                </Button>
                <Button size="large" icon={<CopyOutlined />} onClick={copyLink}>
                  {t("appDownload.copyLink")}
                </Button>
              </div>

              <div className={styles.linkBox}>
                <span>{t("appDownload.directLink")}</span>
                <code>{downloadUrl}</code>
              </div>

              {release.forceUpdate && (
                <Alert
                  type="warning"
                  showIcon
                  title={t("appDownload.forceUpdate")}
                />
              )}
            </>
          )}
        </div>

        <aside className={styles.qrCard}>
          {release ? (
            <>
              <div className={styles.qrFrame}>
                <QRCodeSVG
                  value={downloadUrl}
                  size={226}
                  level="H"
                  marginSize={2}
                  title={t("appDownload.qrTitle")}
                />
              </div>
              <h2>{t("appDownload.scanTitle")}</h2>
              <p>{t("appDownload.scanHint")}</p>
              <div className={styles.verified}>
                <CheckCircleFilled /> {t("appDownload.verified")}
              </div>
            </>
          ) : loading ? (
            <Skeleton.Image active className={styles.qrSkeleton} />
          ) : (
            <Empty description={t("appDownload.noRelease")} />
          )}
        </aside>
      </section>

      {release && (
        <section className={styles.details}>
          <article>
            <h2>{t("appDownload.releaseNotes")}</h2>
            <div className={styles.notes}>
              {release.releaseNotes || t("appDownload.noReleaseNotes")}
            </div>
          </article>
          <article>
            <h2>{t("appDownload.security")}</h2>
            <dl>
              <dt>{t("appDownload.publishedAt")}</dt>
              <dd>
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(release.publishedAt))}
              </dd>
              <dt>SHA-256</dt>
              <dd className={styles.hash}>{release.sha256}</dd>
            </dl>
          </article>
          <article className={styles.installGuide}>
            <SafetyCertificateOutlined />
            <div>
              <h2>{t("appDownload.installTitle")}</h2>
              <p>{t("appDownload.installHint")}</p>
            </div>
          </article>
        </section>
      )}
    </main>
  );
}
