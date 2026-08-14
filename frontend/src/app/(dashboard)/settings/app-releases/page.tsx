"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AndroidOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  FileZipOutlined,
  InboxOutlined,
  LinkOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Result,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import type { UploadProps } from "antd";
import { QRCodeSVG } from "qrcode.react";
import {
  AppRelease,
  appReleasesApi,
  getAppDownloadUrl,
} from "@/lib/api/app-releases";
import { useTranslation } from "@/i18n/useTranslation";
import { Role } from "@/lib/auth/role";
import { useAuthStore } from "@/lib/auth/store";
import { ApkMetadata, inspectApk } from "@/lib/apk/inspect";
import styles from "./app-releases.module.css";

type PublishForm = {
  versionName: string;
  versionCode: number;
  minimumSupportedVersionCode?: number;
  forceUpdate: boolean;
  releaseNotes?: string;
};

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function AppReleasesPage() {
  const { t, locale } = useTranslation();
  const isHeadquarters = useAuthStore(
    (state) => state.user?.role === Role.HQ_ADMIN,
  );
  const [form] = Form.useForm<PublishForm>();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [apkMetadata, setApkMetadata] = useState<ApkMetadata | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const inspectionSequence = useRef(0);
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [invalidatingId, setInvalidatingId] = useState<string | null>(null);
  const [publicPageUrl, setPublicPageUrl] = useState("/app-download");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReleases(await appReleasesApi.list());
    } catch {
      message.error(t("appReleases.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPublicPageUrl(`${window.location.origin}/app-download`);
    if (isHeadquarters) void load();
  }, [isHeadquarters, load]);

  const latest = useMemo(
    () => releases.find((release) => release.status === "PUBLISHED") ?? null,
    [releases],
  );

  const clearSelectedFile = useCallback(() => {
    inspectionSequence.current += 1;
    setSelectedFile(null);
    setApkMetadata(null);
    setInspecting(false);
    form.setFieldsValue({ versionName: undefined, versionCode: undefined });
  }, [form]);

  const uploadProps: UploadProps = {
    accept: ".apk,application/vnd.android.package-archive",
    maxCount: 1,
    showUploadList: false,
    beforeUpload: (file) => {
      if (!file.name.toLowerCase().endsWith(".apk")) {
        message.error(t("appReleases.apkOnly"));
        return Upload.LIST_IGNORE;
      }
      const sequence = inspectionSequence.current + 1;
      inspectionSequence.current = sequence;
      setSelectedFile(file);
      setApkMetadata(null);
      setInspecting(true);
      form.setFieldsValue({ versionName: undefined, versionCode: undefined });
      void inspectApk(file)
        .then((metadata) => {
          if (inspectionSequence.current !== sequence) return;
          setApkMetadata(metadata);
          form.setFieldsValue({
            versionName: metadata.versionName,
            versionCode: metadata.versionCode,
          });
          message.success(t("appReleases.metadataRead"));
        })
        .catch(() => {
          if (inspectionSequence.current !== sequence) return;
          clearSelectedFile();
          message.error(t("appReleases.metadataFailed"));
        })
        .finally(() => {
          if (inspectionSequence.current === sequence) setInspecting(false);
        });
      return false;
    },
  };

  const publish = async (values: PublishForm) => {
    if (!selectedFile || !apkMetadata) {
      message.error(t("appReleases.fileRequired"));
      return;
    }
    const data = new FormData();
    data.append("file", selectedFile);
    data.append("platform", "ANDROID");
    data.append("versionName", values.versionName);
    data.append("versionCode", String(values.versionCode));
    data.append("forceUpdate", String(values.forceUpdate ?? false));
    if (values.minimumSupportedVersionCode) {
      data.append(
        "minimumSupportedVersionCode",
        String(values.minimumSupportedVersionCode),
      );
    }
    if (values.releaseNotes) data.append("releaseNotes", values.releaseNotes);

    setPublishing(true);
    try {
      await appReleasesApi.publish(data);
      message.success(t("appReleases.publishSuccess"));
      form.resetFields();
      clearSelectedFile();
      await load();
    } catch {
      message.error(t("appReleases.publishFailed"));
    } finally {
      setPublishing(false);
    }
  };

  const invalidate = async (release: AppRelease) => {
    setInvalidatingId(release.id);
    try {
      await appReleasesApi.invalidate(release.id);
      message.success(t("appReleases.invalidateSuccess"));
      await load();
    } catch {
      message.error(t("appReleases.invalidateFailed"));
    } finally {
      setInvalidatingId(null);
    }
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    message.success(t("appReleases.copied"));
  };

  if (!isHeadquarters) {
    return (
      <Result status="403" title="403" subTitle={t("appReleases.hqOnly")} />
    );
  }

  return (
    <div className={styles.page}>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-header-title">{t("appReleases.title")}</h1>
          <div className="page-header-subtitle">
            {t("appReleases.subtitle")}
          </div>
        </div>
        <Button icon={<LinkOutlined />} href="/app-download" target="_blank">
          {t("appReleases.openPublicPage")}
        </Button>
      </div>

      <div className={styles.topGrid}>
        <Card title={t("appReleases.publishTitle")}>
          <Alert
            type="info"
            showIcon
            title={t("appReleases.publishHint")}
            className={styles.hint}
          />
          <Form
            form={form}
            layout="vertical"
            initialValues={{ forceUpdate: false }}
            onFinish={(values) => void publish(values)}
          >
            <div className={styles.formGrid}>
              <Form.Item
                label={t("appReleases.versionName")}
                name="versionName"
                rules={[{ required: true, message: t("appReleases.required") }]}
              >
                <Input
                  placeholder={t("appReleases.autoFromApk")}
                  maxLength={50}
                  disabled
                />
              </Form.Item>
              <Form.Item
                label={t("appReleases.versionCode")}
                name="versionCode"
                rules={[{ required: true, message: t("appReleases.required") }]}
              >
                <InputNumber
                  min={1}
                  precision={0}
                  disabled
                  className={styles.fullWidth}
                />
              </Form.Item>
              <Form.Item
                label={t("appReleases.minimumVersionCode")}
                name="minimumSupportedVersionCode"
              >
                <InputNumber
                  min={1}
                  precision={0}
                  className={styles.fullWidth}
                />
              </Form.Item>
              <Form.Item
                label={t("appReleases.forceUpdate")}
                name="forceUpdate"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </div>
            <Form.Item
              label={t("appReleases.releaseNotes")}
              name="releaseNotes"
            >
              <Input.TextArea rows={4} maxLength={5000} showCount />
            </Form.Item>
            {selectedFile ? (
              <div className={styles.selectedFile}>
                <span className={styles.fileIcon}>
                  <FileZipOutlined />
                </span>
                <div className={styles.fileInfo}>
                  <strong>{selectedFile.name}</strong>
                  {inspecting ? (
                    <span>{t("appReleases.readingMetadata")}</span>
                  ) : apkMetadata ? (
                    <span>
                      {apkMetadata.packageName} · v{apkMetadata.versionName} ·
                      Build {apkMetadata.versionCode}
                    </span>
                  ) : null}
                </div>
                <Space>
                  <Upload {...uploadProps}>
                    <Button disabled={inspecting || publishing}>
                      {t("appReleases.replaceApk")}
                    </Button>
                  </Upload>
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    disabled={publishing}
                    onClick={clearSelectedFile}
                  >
                    {t("appReleases.removeApk")}
                  </Button>
                </Space>
              </div>
            ) : (
              <Upload.Dragger {...uploadProps} className={styles.uploader}>
                <p className="ant-upload-drag-icon">
                  <InboxOutlined />
                </p>
                <p className="ant-upload-text">{t("appReleases.dragApk")}</p>
                <p className="ant-upload-hint">
                  {t("appReleases.uploadLimit")}
                </p>
              </Upload.Dragger>
            )}
            <Button
              type="primary"
              htmlType="submit"
              icon={<UploadOutlined />}
              loading={publishing}
              disabled={!apkMetadata || inspecting}
              className={styles.publishButton}
            >
              {t("appReleases.publish")}
            </Button>
          </Form>
        </Card>

        <Card title={t("appReleases.currentRelease")}>
          {latest ? (
            <div className={styles.currentRelease}>
              <div className={styles.releaseHeadline}>
                <span className={styles.androidIcon}>
                  <AndroidOutlined />
                </span>
                <div>
                  <Typography.Title level={3}>
                    v{latest.versionName}
                  </Typography.Title>
                  <Typography.Text type="secondary">
                    Build {latest.versionCode} · {formatBytes(latest.fileSize)}
                  </Typography.Text>
                </div>
              </div>
              <div className={styles.qrBox}>
                <QRCodeSVG
                  value={publicPageUrl}
                  size={164}
                  level="H"
                  marginSize={2}
                />
              </div>
              <div className={styles.publicLink}>
                <span>{t("appReleases.publicPageLink")}</span>
                <code>{publicPageUrl}</code>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => void copy(publicPageUrl)}
                >
                  {t("appReleases.copy")}
                </Button>
              </div>
              <div className={styles.directLink}>
                <span>{t("appReleases.directDownloadLink")}</span>
                <code>{getAppDownloadUrl(latest)}</code>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => void copy(getAppDownloadUrl(latest))}
                >
                  {t("appReleases.copy")}
                </Button>
              </div>
              <div className={styles.publishedMeta}>
                <CheckCircleOutlined /> {t("appReleases.publishedAt")} ·{" "}
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(latest.publishedAt))}
              </div>
            </div>
          ) : (
            <Alert type="warning" showIcon title={t("appReleases.noRelease")} />
          )}
        </Card>
      </div>

      <Card title={t("appReleases.historyTitle")}>
        <Table<AppRelease>
          rowKey="id"
          loading={loading}
          dataSource={releases}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          scroll={{ x: 980 }}
          columns={[
            {
              title: t("appReleases.version"),
              render: (_, row) => <strong>v{row.versionName}</strong>,
            },
            { title: "Build", dataIndex: "versionCode", width: 90 },
            {
              title: t("appReleases.status"),
              dataIndex: "status",
              width: 110,
              render: (status: AppRelease["status"]) => (
                <Tag
                  color={
                    status === "PUBLISHED"
                      ? "green"
                      : status === "INVALIDATED"
                        ? "red"
                        : "default"
                  }
                >
                  {t(`appReleases.statusValue.${status}`)}
                </Tag>
              ),
            },
            {
              title: t("appReleases.fileSize"),
              dataIndex: "fileSize",
              width: 100,
              render: formatBytes,
            },
            {
              title: t("appReleases.downloads"),
              dataIndex: "downloadCount",
              width: 90,
            },
            {
              title: t("appReleases.publisher"),
              width: 120,
              render: (_, row) => row.publishedBy?.displayName ?? "—",
            },
            {
              title: t("appReleases.publishedAt"),
              dataIndex: "publishedAt",
              width: 180,
              render: (value: string) => new Date(value).toLocaleString(),
            },
            {
              title: t("appReleases.actions"),
              fixed: "right",
              width: 160,
              render: (_, row) => (
                <Space>
                  {row.status !== "INVALIDATED" && (
                    <>
                      <Button size="small" href={getAppDownloadUrl(row)}>
                        {t("appReleases.download")}
                      </Button>
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => void copy(getAppDownloadUrl(row))}
                      />
                    </>
                  )}
                  {row.status !== "INVALIDATED" && (
                    <Popconfirm
                      title={t("appReleases.invalidateConfirm")}
                      description={t("appReleases.invalidateDescription")}
                      okText={t("appReleases.invalidate")}
                      cancelText={t("appReleases.cancel")}
                      onConfirm={() => void invalidate(row)}
                    >
                      <Button
                        size="small"
                        danger
                        loading={invalidatingId === row.id}
                      >
                        {t("appReleases.invalidate")}
                      </Button>
                    </Popconfirm>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
