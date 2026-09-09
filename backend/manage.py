#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys


def _force_utf8_output():
    """
    Print UTF-8 regardless of the console's codepage.

    A Windows console defaults to a legacy codepage (cp1252 here), and quite a
    lot of this project prints non-ASCII: migrations report with a tick, the
    signal handlers log with a warning sign. On Windows every one of those is
    a UnicodeEncodeError that takes the whole command down with it -- most
    painfully `migrate`, which then fails partway through creating a test
    database and leaves it behind for the next run to trip over.

    Reconfiguring here fixes every management command at once, which is better
    than expecting each caller to remember PYTHONIOENCODING. Guarded with
    getattr because stdout is not always a TextIOWrapper -- a test harness or
    a capturing runner may have replaced it with something that has no
    reconfigure().
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            try:
                reconfigure(encoding="utf-8")
            except (ValueError, OSError):
                # Detached or already-closed stream: not worth failing over.
                pass


def main():
    """Run administrative tasks."""
    _force_utf8_output()
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
