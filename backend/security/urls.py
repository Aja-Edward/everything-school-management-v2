# security/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path('audit-logs/', views.audit_logs, name='audit-logs'),
    path('login-attempts/', views.login_attempts, name='login-attempts'),
    path('unlock-account/', views.unlock_account, name='unlock-account'),
]
