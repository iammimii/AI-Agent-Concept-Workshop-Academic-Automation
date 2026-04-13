from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # App
    app_name: str = "Email AI PoC"
    debug: bool = False

    # Azure / Microsoft Graph
    azure_client_id: str = ""
    azure_client_secret: str = ""
    azure_tenant_id: str = ""
    graph_api_base: str = "https://graph.microsoft.com/v1.0"
    outlook_user: str = ""

    # Groq
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    # Email processing
    max_email_body_chars: int = 4000


settings = Settings()
