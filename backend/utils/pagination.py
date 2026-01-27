"""
Pagination classes for the school management platform.

These classes provide consistent pagination across all API endpoints
to prevent performance issues with large datasets.
"""

from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardResultsPagination(PageNumberPagination):
    """
    Standard pagination for most endpoints.

    Use for: Exams, Teachers, Classrooms, Messages, Templates, etc.
    Default: 20 items per page
    Max: 100 items per page
    """
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response({
            'count': self.page.paginator.count,
            'next': self.get_next_link(),
            'previous': self.get_previous_link(),
            'total_pages': self.page.paginator.num_pages,
            'current_page': self.page.number,
            'page_size': self.page_size,
            'results': data
        })


class LargeResultsPagination(PageNumberPagination):
    """
    Pagination for endpoints with large datasets.

    Use for: Students, Fees, Payments, Results, Attendance, etc.
    Default: 50 items per page
    Max: 200 items per page
    """
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200

    def get_paginated_response(self, data):
        return Response({
            'count': self.page.paginator.count,
            'next': self.get_next_link(),
            'previous': self.get_previous_link(),
            'total_pages': self.page.paginator.num_pages,
            'current_page': self.page.number,
            'page_size': self.page_size,
            'results': data
        })


class SmallResultsPagination(PageNumberPagination):
    """
    Pagination for endpoints with smaller datasets or detailed views.

    Use for: Detailed reports, dashboards, analytics, etc.
    Default: 10 items per page
    Max: 50 items per page
    """
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 50

    def get_paginated_response(self, data):
        return Response({
            'count': self.page.paginator.count,
            'next': self.get_next_link(),
            'previous': self.get_previous_link(),
            'total_pages': self.page.paginator.num_pages,
            'current_page': self.page.number,
            'page_size': self.page_size,
            'results': data
        })


class NoPagination(PageNumberPagination):
    """
    Special case pagination that returns all results.

    WARNING: Use ONLY for small, fixed-size datasets like:
    - Grade levels (typically 10-15 items)
    - Sections (typically 5-10 items)
    - Payment gateways (typically 3-5 items)

    Never use for: Students, Results, Payments, Messages, etc.
    """
    page_size = None

    def paginate_queryset(self, queryset, request, view=None):
        # Return None to indicate no pagination
        return None
