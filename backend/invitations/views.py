from django.shortcuts import render

# invitations/views.py
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Invitation
from .serializers import InvitationSerializer


from utils.email import send_email_via_brevo  # your helper
from utils.section_filtering import AutoSectionFilterMixin
from django.conf import settings
from rest_framework.generics import RetrieveAPIView
from rest_framework.exceptions import NotFound

from rest_framework.views import APIView
from users.models import CustomUser
from django.utils import timezone
from django.contrib.auth.hashers import make_password


class InviteStudentView(generics.CreateAPIView):
    serializer_class = InvitationSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        if request.user.role != "admin":
            return Response({"detail": "Only admins can invite users."}, status=403)

        response = self.create(request, *args, **kwargs)

        invitation = Invitation.objects.get(id=response.data["id"])
        invite_link = f"https://your-frontend.com/invite/{invitation.token}"

        subject = "You're Invited to Join Everything School"
        html_content = f"""
        <h2>Hello!</h2>
        <p>You have been invited as a <strong>{invitation.role}</strong>.</p>
        <p>Click below to accept your invitation:</p>
        <a href="{invite_link}">{invite_link}</a>
        <br><br>
        <p>This invite will expire in 3 days.</p>
        """

        send_email_via_brevo(subject, html_content, invitation.email)

        return response


class RetrieveInvitationView(RetrieveAPIView):
    serializer_class = InvitationSerializer
    lookup_field = "token"
    queryset = Invitation.objects.all()

    def get_object(self):
        obj = super().get_object()
        if obj.is_used or obj.is_expired():
            raise NotFound("This invitation is no longer valid.")
        return obj


class AcceptInvitationView(APIView):
    def post(self, request):
        token = request.data.get("token")
        first_name = request.data.get("first_name")
        last_name = request.data.get("last_name")
        password = request.data.get("password")

        try:
            invitation = Invitation.objects.get(token=token)
        except Invitation.DoesNotExist:
            return Response({"detail": "Invalid token"}, status=404)

        if invitation.is_used or invitation.is_expired():
            return Response({"detail": "Invitation expired or used"}, status=400)

        # An Invitation records no school of its own; the person joins the
        # school of whoever invited them.
        from tenants.membership import user_school_id

        user = CustomUser.objects.create(
            email=invitation.email,
            first_name=first_name,
            last_name=last_name,
            role=invitation.role,
            is_active=True,
            password=make_password(password),
            tenant_id=user_school_id(invitation.invited_by),
        )

        invitation.is_used = True
        invitation.save()

        return Response({"detail": "Account created successfully."}, status=201)
