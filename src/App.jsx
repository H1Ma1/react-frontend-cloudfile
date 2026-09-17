import { useEffect, useState } from "react";
import "./App.css";


const API_URL =
  import.meta.env.PROD
    ? "/api"
    : "http://localhost:8000";


const PENDING_UPLOAD_KEY =
  "pending_upload_id";


let refreshPromise = null;


// ==================================================
// ОШИБКИ FASTAPI
// ==================================================

function getApiErrorMessage(
  data,
  status
) {
  if (!data) {
    return `Ошибка ${status}`;
  }


  if (
    typeof data.detail ===
    "string"
  ) {
    return data.detail;
  }


  if (
    Array.isArray(
      data.detail
    )
  ) {
    return data.detail
      .map((item) => {
        const location =
          Array.isArray(item.loc)
            ? item.loc
                .filter(
                  (part) =>
                    part !== "body"
                )
                .join(" → ")
            : "";


        const message =
          item.msg ||
          "Ошибка валидации";


        if (location) {
          return `${location}: ${message}`;
        }


        return message;
      })
      .join("; ");
  }


  if (
    data.detail &&
    typeof data.detail ===
      "object"
  ) {
    if (
      typeof data.detail.message ===
      "string"
    ) {
      return data.detail.message;
    }


    try {
      return JSON.stringify(
        data.detail
      );
    } catch {
      return `Ошибка ${status}`;
    }
  }


  if (
    typeof data.message ===
    "string"
  ) {
    return data.message;
  }


  return `Ошибка ${status}`;
}


// ==================================================
// REFRESH TOKEN
// ==================================================

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = fetch(
      `${API_URL}/auth/refresh`,
      {
        method: "POST",
        credentials: "include",
      }
    )
      .then(
        (response) =>
          response.ok
      )
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }


  return refreshPromise;
}


// ==================================================
// ОБЩИЙ API REQUEST
// ==================================================

async function apiRequest(
  path,
  options = {},
  tryRefresh = true
) {
  let response;


  try {
    response = await fetch(
      `${API_URL}${path}`,
      {
        ...options,

        credentials: "include",

        headers: {
          ...(options.body
            ? {
                "Content-Type":
                  "application/json",
              }
            : {}),

          ...(options.headers ||
            {}),
        },
      }
    );
  } catch (networkError) {
    console.error(
      "Backend connection error:",
      networkError
    );


    throw new Error(
      "Не удалось подключиться к backend"
    );
  }


  if (
    response.status === 401 &&
    tryRefresh &&
    path !== "/auth/login" &&
    path !== "/auth/register" &&
    path !== "/auth/refresh"
  ) {
    const refreshed =
      await refreshAccessToken();


    if (refreshed) {
      return apiRequest(
        path,
        options,
        false
      );
    }
  }


  let data = null;


  try {
    data =
      await response.json();
  } catch {
    data = null;
  }


  if (!response.ok) {
    throw new Error(
      getApiErrorMessage(
        data,
        response.status
      )
    );
  }


  return data;
}


// ==================================================
// FORMAT BYTES
// ==================================================

function formatBytes(bytes) {
  if (
    !Number.isFinite(bytes) ||
    bytes <= 0
  ) {
    return "0 B";
  }


  const units = [
    "B",
    "KB",
    "MB",
    "GB",
    "TB",
  ];


  let value = bytes;
  let unitIndex = 0;


  while (
    value >= 1000 &&
    unitIndex <
      units.length - 1
  ) {
    value /= 1000;
    unitIndex++;
  }


  return `${value.toFixed(
    unitIndex === 0
      ? 0
      : value >= 10
        ? 1
        : 2
  )} ${units[unitIndex]}`;
}


// ==================================================
// FORMAT DATE
// ==================================================

function formatDate(date) {
  if (!date) {
    return "";
  }


  return new Date(
    date
  ).toLocaleString("ru-RU");
}


// ==================================================
// BACKEND STATUS BUTTON
// ==================================================

function BackendStatusButton() {
  const [
    status,
    setStatus,
  ] = useState("idle");


  const [
    statusMessage,
    setStatusMessage,
  ] = useState("");


  async function checkBackend() {
    if (
      status === "checking" ||
      status === "waking"
    ) {
      return;
    }


    setStatus("checking");

    setStatusMessage(
      "Проверяем backend..."
    );


    let slowRequest = false;


    const wakeTimer =
      setTimeout(() => {
        slowRequest = true;


        setStatus(
          "waking"
        );


        setStatusMessage(
          "Backend, похоже, спит. Пробуждаем его. Это может занять около минуты..."
        );
      }, 4000);


    const controller =
      new AbortController();


    const requestTimeout =
      setTimeout(() => {
        controller.abort();
      }, 90000);


    const startedAt =
      Date.now();


    try {
      const response =
        await fetch(
          `${API_URL}/health`,
          {
            method: "GET",

            signal:
              controller.signal,

            cache: "no-store",
          }
        );


      clearTimeout(
        wakeTimer
      );


      clearTimeout(
        requestTimeout
      );


      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }


      const elapsed =
        Math.max(
          1,
          Math.round(
            (
              Date.now() -
              startedAt
            ) / 1000
          )
        );


      setStatus(
        "online"
      );


      if (
        slowRequest ||
        elapsed >= 4
      ) {
        setStatusMessage(
          `Backend проснулся и работает. Ответ получен за ${elapsed} сек.`
        );
      } else {
        setStatusMessage(
          `Backend работает. Ответ получен за ${elapsed} сек.`
        );
      }
    } catch (err) {
      clearTimeout(
        wakeTimer
      );


      clearTimeout(
        requestTimeout
      );


      console.error(
        "Backend health error:",
        err
      );


      setStatus(
        "offline"
      );


      if (
        err.name ===
        "AbortError"
      ) {
        setStatusMessage(
          "Backend не ответил за 90 секунд."
        );
      } else {
        setStatusMessage(
          "Не удалось подключиться к backend."
        );
      }
    }
  }


  return (
    <div className="backend-status">
      <button
        type="button"
        className={`backend-status-button ${status}`}
        onClick={
          checkBackend
        }
        disabled={
          status ===
            "checking" ||
          status ===
            "waking"
        }
      >
        <span
          className="backend-status-dot"
        />


        {status === "idle" &&
          "Проверить backend"}


        {status ===
          "checking" &&
          "Проверяем..."}


        {status ===
          "waking" &&
          "Пробуждаем backend..."}


        {status ===
          "online" &&
          "Backend работает"}


        {status ===
          "offline" &&
          "Проверить снова"}
      </button>


      {statusMessage && (
        <div
          className={`backend-status-message ${status}`}
        >
          {statusMessage}
        </div>
      )}
    </div>
  );
}


// ==================================================
// APP
// ==================================================

function App() {
  const [
    user,
    setUser,
  ] = useState(null);


  const [
    loadingUser,
    setLoadingUser,
  ] = useState(true);


  // AUTH

  const [
    authMode,
    setAuthMode,
  ] = useState("login");


  const [
    username,
    setUsername,
  ] = useState("");


  const [
    password,
    setPassword,
  ] = useState("");


  const [
    repeatPassword,
    setRepeatPassword,
  ] = useState("");


  const [
    authLoading,
    setAuthLoading,
  ] = useState(false);


  // FILES

  const [
    files,
    setFiles,
  ] = useState([]);


  const [
    storage,
    setStorage,
  ] = useState(null);


  const [
    dataLoading,
    setDataLoading,
  ] = useState(false);


  // UPLOAD

  const [
    selectedFile,
    setSelectedFile,
  ] = useState(null);


  const [
    uploadProgress,
    setUploadProgress,
  ] = useState(0);


  const [
    uploading,
    setUploading,
  ] = useState(false);


  // MESSAGES

  const [
    message,
    setMessage,
  ] = useState("");


  const [
    error,
    setError,
  ] = useState("");


  // ==================================================
  // START
  // ==================================================

  useEffect(() => {
    async function startApp() {
      const authenticated =
        await checkCurrentUser();


      if (!authenticated) {
        setLoadingUser(false);

        return;
      }


      const pendingId =
        localStorage.getItem(
          PENDING_UPLOAD_KEY
        );


      if (pendingId) {
        try {
          await apiRequest(
            `/files/${pendingId}/pending`,
            {
              method: "DELETE",
            }
          );
        } catch (
          cleanupError
        ) {
          console.error(
            "Pending cleanup error:",
            cleanupError
          );
        } finally {
          localStorage.removeItem(
            PENDING_UPLOAD_KEY
          );
        }
      }


      await loadData();


      setLoadingUser(false);
    }


    startApp();
  }, []);


  // ==================================================
  // CURRENT USER
  // ==================================================

  async function checkCurrentUser() {
    try {
      const currentUser =
        await apiRequest(
          "/auth/me"
        );


      setUser(
        currentUser
      );


      return true;
    } catch {
      setUser(null);


      return false;
    }
  }


  // ==================================================
  // LOAD FILES + STORAGE
  // ==================================================

  async function loadData() {
    setDataLoading(true);


    try {
      const [
        fileList,
        storageData,
      ] =
        await Promise.all([
          apiRequest(
            "/files"
          ),

          apiRequest(
            "/files/storage"
          ),
        ]);


      setFiles(
        fileList
      );


      setStorage(
        storageData
      );
    } catch (err) {
      setError(
        err.message
      );
    } finally {
      setDataLoading(false);
    }
  }


  // ==================================================
  // REGISTER
  // ==================================================

  async function handleRegister(
    event
  ) {
    event.preventDefault();


    setError("");
    setMessage("");


    if (
      password !==
      repeatPassword
    ) {
      setError(
        "Пароли не совпадают"
      );


      return;
    }


    setAuthLoading(true);


    try {
      await apiRequest(
        "/auth/register",
        {
          method: "POST",

          body:
            JSON.stringify({
              username:
                username.trim(),

              password,
            }),
        }
      );


      setMessage(
        "Аккаунт создан. Теперь войди."
      );


      setAuthMode(
        "login"
      );


      setPassword("");
      setRepeatPassword("");
    } catch (err) {
      console.error(
        "Register error:",
        err
      );


      setError(
        err.message
      );
    } finally {
      setAuthLoading(false);
    }
  }


  // ==================================================
  // LOGIN
  // ==================================================

  async function handleLogin(
    event
  ) {
    event.preventDefault();


    setError("");
    setMessage("");


    setAuthLoading(true);


    try {
      await apiRequest(
        "/auth/login",
        {
          method: "POST",

          body:
            JSON.stringify({
              username:
                username.trim(),

              password,
            }),
        }
      );


      const currentUser =
        await apiRequest(
          "/auth/me"
        );


      setUser(
        currentUser
      );


      setUsername("");
      setPassword("");


      const pendingId =
        localStorage.getItem(
          PENDING_UPLOAD_KEY
        );


      if (pendingId) {
        try {
          await apiRequest(
            `/files/${pendingId}/pending`,
            {
              method:
                "DELETE",
            }
          );
        } catch (
          cleanupError
        ) {
          console.error(
            cleanupError
          );
        }


        localStorage.removeItem(
          PENDING_UPLOAD_KEY
        );
      }


      await loadData();
    } catch (err) {
      console.error(
        "Login error:",
        err
      );


      setError(
        err.message
      );
    } finally {
      setAuthLoading(false);
    }
  }


  // ==================================================
  // LOGOUT
  // ==================================================

  async function handleLogout() {
    setError("");
    setMessage("");


    const pendingId =
      localStorage.getItem(
        PENDING_UPLOAD_KEY
      );


    if (pendingId) {
      try {
        await apiRequest(
          `/files/${pendingId}/pending`,
          {
            method: "DELETE",
          }
        );
      } catch {
        // cleanup на backend
        // потом подстрахует
      }


      localStorage.removeItem(
        PENDING_UPLOAD_KEY
      );
    }


    try {
      await apiRequest(
        "/auth/logout",
        {
          method: "POST",
        }
      );
    } catch {
      //
    }


    setUser(null);

    setFiles([]);

    setStorage(null);

    setSelectedFile(null);

    setUploadProgress(0);


    setMessage(
      "Ты вышел из аккаунта"
    );
  }


  // ==================================================
  // UPLOAD DIRECTLY TO R2
  // ==================================================

  function uploadFileToR2(
    uploadUrl,
    file
  ) {
    return new Promise(
      (
        resolve,
        reject
      ) => {
        const xhr =
          new XMLHttpRequest();


        xhr.open(
          "PUT",
          uploadUrl
        );


        if (file.type) {
          xhr.setRequestHeader(
            "Content-Type",
            file.type
          );
        }


        xhr.upload.onprogress =
          (event) => {
            if (
              event.lengthComputable
            ) {
              const percent =
                Math.round(
                  (
                    event.loaded /
                    event.total
                  ) *
                    100
                );


              setUploadProgress(
                percent
              );
            }
          };


        xhr.onload = () => {
          if (
            xhr.status >= 200 &&
            xhr.status < 300
          ) {
            resolve();
          } else {
            reject(
              new Error(
                `R2 upload error: ${xhr.status}`
              )
            );
          }
        };


        xhr.onerror = () => {
          reject(
            new Error(
              "Не удалось загрузить файл в R2. Проверь CORS."
            )
          );
        };


        xhr.onabort = () => {
          reject(
            new Error(
              "Загрузка была отменена"
            )
          );
        };


        xhr.send(file);
      }
    );
  }


  // ==================================================
  // CANCEL PENDING
  // ==================================================

  async function cancelPendingUpload(
    fileId
  ) {
    if (!fileId) {
      return;
    }


    try {
      await apiRequest(
        `/files/${fileId}/pending`,
        {
          method: "DELETE",
        }
      );
    } catch (
      cancelError
    ) {
      console.error(
        "Pending cancel error:",
        cancelError
      );
    } finally {
      const savedId =
        localStorage.getItem(
          PENDING_UPLOAD_KEY
        );


      if (
        savedId === fileId
      ) {
        localStorage.removeItem(
          PENDING_UPLOAD_KEY
        );
      }
    }
  }


  // ==================================================
  // UPLOAD FLOW
  // ==================================================

  async function handleUpload() {
    if (
      !selectedFile ||
      uploading
    ) {
      return;
    }


    setError("");
    setMessage("");


    setUploading(true);

    setUploadProgress(0);


    let preparedFileId =
      null;


    try {
      if (
        storage &&
        selectedFile.size >
          storage.free
      ) {
        throw new Error(
          `Недостаточно места. Свободно ${formatBytes(
            storage.free
          )}`
        );
      }


      const prepared =
        await apiRequest(
          "/files/upload-url",
          {
            method: "POST",

            body:
              JSON.stringify({
                original_name:
                  selectedFile.name,

                size:
                  selectedFile.size,

                content_type:
                  selectedFile.type ||
                  null,
              }),
          }
        );


      preparedFileId =
        prepared.file.id;


      localStorage.setItem(
        PENDING_UPLOAD_KEY,
        preparedFileId
      );


      await loadData();


      await uploadFileToR2(
        prepared.upload_url,
        selectedFile
      );


      await apiRequest(
        `/files/${preparedFileId}/confirm`,
        {
          method: "POST",
        }
      );


      localStorage.removeItem(
        PENDING_UPLOAD_KEY
      );


      setMessage(
        "Файл успешно загружен"
      );


      setSelectedFile(
        null
      );


      setUploadProgress(
        100
      );


      await loadData();
    } catch (err) {
      console.error(
        "Upload error:",
        err
      );


      if (
        preparedFileId
      ) {
        await cancelPendingUpload(
          preparedFileId
        );
      }


      setError(
        err.message
      );


      await loadData();
    } finally {
      setUploading(false);
    }
  }


  // ==================================================
  // DOWNLOAD
  // ==================================================

  async function handleDownload(
    file
  ) {
    setError("");
    setMessage("");


    try {
      const result =
        await apiRequest(
          `/files/${file.id}/download-url`
        );


      const link =
        document.createElement(
          "a"
        );


      link.href =
        result.download_url;


      link.style.display =
        "none";


      document.body.appendChild(
        link
      );


      link.click();


      link.remove();
    } catch (err) {
      setError(
        err.message
      );
    }
  }


  // ==================================================
  // DELETE
  // ==================================================

  async function handleDelete(
    file
  ) {
    const confirmed =
      window.confirm(
        `Удалить файл "${file.original_name}"?`
      );


    if (!confirmed) {
      return;
    }


    setError("");
    setMessage("");


    try {
      await apiRequest(
        `/files/${file.id}`,
        {
          method: "DELETE",
        }
      );


      setMessage(
        "Файл удалён"
      );


      await loadData();
    } catch (err) {
      setError(
        err.message
      );
    }
  }


  // ==================================================
  // LOADING
  // ==================================================

  if (loadingUser) {
    return (
      <div className="loading-screen">
        <div className="loader" />

        <p>
          Загрузка CloudFile...
        </p>
      </div>
    );
  }


  // ==================================================
  // LOGIN / REGISTER
  // ==================================================

  if (!user) {
    return (
      <div className="auth-page">
        <div className="auth-left">
          <div className="logo">
            C
          </div>


          <div className="auth-hero">
            <span className="small-title">
              CLOUDFILE
            </span>


            <h1>
              Твоё личное
              <br />
              облачное хранилище.
            </h1>


            <p>
              FastAPI + PostgreSQL +
              Cloudflare R2
            </p>
          </div>


          <div className="architecture">
            Browser → FastAPI → R2
          </div>
        </div>


        <div className="auth-right">
          <form
            className="auth-card"
            onSubmit={
              authMode ===
              "login"
                ? handleLogin
                : handleRegister
            }
          >
            <span className="small-title">
              {authMode ===
              "login"
                ? "С ВОЗВРАЩЕНИЕМ"
                : "НОВЫЙ АККАУНТ"}
            </span>


            <h2>
              {authMode ===
              "login"
                ? "Войти"
                : "Регистрация"}
            </h2>


            <BackendStatusButton />


            {error && (
              <div className="alert error">
                {error}
              </div>
            )}


            {message && (
              <div className="alert success">
                {message}
              </div>
            )}


            <label>
              Username

              <input
                type="text"
                placeholder="vlad123"
                value={username}
                onChange={(
                  event
                ) =>
                  setUsername(
                    event.target
                      .value
                  )
                }
                autoComplete="username"
                minLength={3}
                maxLength={50}
                required
              />
            </label>


            <label>
              Пароль

              <input
                type="password"
                placeholder="Минимум 8 символов"
                value={password}
                onChange={(
                  event
                ) =>
                  setPassword(
                    event.target
                      .value
                  )
                }
                autoComplete={
                  authMode ===
                  "login"
                    ? "current-password"
                    : "new-password"
                }
                minLength={8}
                maxLength={128}
                required
              />
            </label>


            {authMode ===
              "register" && (
              <label>
                Повторите пароль

                <input
                  type="password"
                  placeholder="Повторите пароль"
                  value={
                    repeatPassword
                  }
                  onChange={(
                    event
                  ) =>
                    setRepeatPassword(
                      event.target
                        .value
                    )
                  }
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
              </label>
            )}


            <button
              className="primary-button"
              disabled={
                authLoading
              }
            >
              {authLoading
                ? "Подождите..."
                : authMode ===
                    "login"
                  ? "Войти"
                  : "Создать аккаунт"}
            </button>


            <button
              type="button"
              className="link-button"
              onClick={() => {
                setError("");
                setMessage("");

                setPassword("");

                setRepeatPassword(
                  ""
                );


                setAuthMode(
                  authMode ===
                    "login"
                    ? "register"
                    : "login"
                );
              }}
            >
              {authMode ===
              "login"
                ? "Нет аккаунта? Зарегистрироваться"
                : "Уже есть аккаунт? Войти"}
            </button>
          </form>
        </div>
      </div>
    );
  }


  // ==================================================
  // STORAGE %
  // ==================================================

  const storagePercent =
    storage &&
    storage.limit > 0
      ? Math.min(
          100,
          (
            storage.used /
            storage.limit
          ) * 100
        )
      : 0;


  // ==================================================
  // DASHBOARD
  // ==================================================

  return (
    <div className="app">
      <header className="header">
        <div className="header-logo">
          <div className="logo small">
            C
          </div>

          CloudFile
        </div>


        <div className="header-user">
          <div className="username">
            {user.username}
          </div>


          <button
            className="secondary-button"
            onClick={
              handleLogout
            }
            disabled={
              uploading
            }
          >
            Выйти
          </button>
        </div>
      </header>


      <main className="container">
        <section className="hero">
          <div>
            <span className="small-title">
              ЛИЧНОЕ ПРОСТРАНСТВО
            </span>


            <h1>
              Твои файлы
            </h1>


            <p>
              Загружай файлы и
              открывай их с любого
              компьютера.
            </p>
          </div>


          <div className="hero-actions">
            <BackendStatusButton />


            <button
              className="secondary-button"
              onClick={
                loadData
              }
              disabled={
                dataLoading ||
                uploading
              }
            >
              {dataLoading
                ? "Обновление..."
                : "Обновить"}
            </button>
          </div>
        </section>


        {error && (
          <div className="alert error">
            {error}
          </div>
        )}


        {message && (
          <div className="alert success">
            {message}
          </div>
        )}


        <section className="storage-card">
          <div className="storage-header">
            <div>
              <span className="small-title">
                ОБЩЕЕ ХРАНИЛИЩЕ
              </span>


              <h3>
                {storage
                  ? `${formatBytes(
                      storage.used
                    )} из ${formatBytes(
                      storage.limit
                    )}`
                  : "Загрузка..."}
              </h3>
            </div>


            <div className="storage-free">
              <span>
                Свободно
              </span>


              <strong>
                {storage
                  ? formatBytes(
                      storage.free
                    )
                  : "..."}
              </strong>
            </div>
          </div>


          <div className="storage-bar">
            <div
              className="storage-progress"
              style={{
                width:
                  `${storagePercent}%`,
              }}
            />
          </div>


          <div className="storage-meta">
            <span>
              {storagePercent.toFixed(
                1
              )}
              % занято
            </span>


            <span>
              Общий пул для всех
              пользователей
            </span>
          </div>
        </section>


        <section className="upload-card">
          <div>
            <span className="small-title">
              НОВАЯ ЗАГРУЗКА
            </span>


            <h2>
              Добавить файл
            </h2>
          </div>


          <input
            className="file-input"
            type="file"
            onChange={(
              event
            ) => {
              const file =
                event.target
                  .files?.[0] ||
                null;


              setError("");
              setMessage("");
              setUploadProgress(
                0
              );


              if (
                file &&
                storage &&
                file.size >
                  storage.free
              ) {
                setSelectedFile(
                  null
                );


                setError(
                  `Недостаточно места. Свободно ${formatBytes(
                    storage.free
                  )}`
                );


                event.target.value =
                  "";


                return;
              }


              setSelectedFile(
                file
              );
            }}
            disabled={
              uploading
            }
          />


          {selectedFile && (
            <div className="selected-file">
              <div className="file-icon">
                ↑
              </div>


              <div>
                <strong>
                  {
                    selectedFile.name
                  }
                </strong>


                <span>
                  {formatBytes(
                    selectedFile.size
                  )}

                  {selectedFile.type &&
                    ` · ${selectedFile.type}`}
                </span>
              </div>
            </div>
          )}


          {uploading && (
            <div>
              <div className="upload-status">
                <span>
                  Загрузка в R2
                </span>


                <strong>
                  {
                    uploadProgress
                  }
                  %
                </strong>
              </div>


              <div className="storage-bar">
                <div
                  className="storage-progress"
                  style={{
                    width:
                      `${uploadProgress}%`,
                  }}
                />
              </div>
            </div>
          )}


          <button
            className="primary-button"
            onClick={
              handleUpload
            }
            disabled={
              !selectedFile ||
              uploading
            }
          >
            {uploading
              ? `Загрузка ${uploadProgress}%`
              : "Загрузить файл"}
          </button>
        </section>


        <section className="files-section">
          <div className="files-title">
            <div>
              <span className="small-title">
                МОИ ФАЙЛЫ
              </span>


              <h2>
                {dataLoading
                  ? "Загрузка..."
                  : `${files.length} файлов`}
              </h2>
            </div>
          </div>


          {!dataLoading &&
            files.length ===
              0 && (
              <div className="empty">
                <div className="empty-icon">
                  ☁
                </div>


                <h3>
                  Здесь пока пусто
                </h3>


                <p>
                  Загрузи первый
                  файл.
                </p>
              </div>
            )}


          <div className="file-list">
            {files.map(
              (file) => (
                <div
                  className="file-row"
                  key={file.id}
                >
                  <div className="file-info">
                    <div className="file-icon">
                      📄
                    </div>


                    <div className="file-details">
                      <strong>
                        {
                          file.original_name
                        }
                      </strong>


                      <span>
                        {formatBytes(
                          file.size
                        )}

                        {" · "}

                        {formatDate(
                          file.created_at
                        )}
                      </span>
                    </div>
                  </div>


                  <div className="file-actions">
                    <button
                      className="secondary-button"
                      onClick={() =>
                        handleDownload(
                          file
                        )
                      }
                    >
                      Скачать
                    </button>


                    <button
                      className="delete-button"
                      onClick={() =>
                        handleDelete(
                          file
                        )
                      }
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        </section>
      </main>
    </div>
  );
}


export default App;