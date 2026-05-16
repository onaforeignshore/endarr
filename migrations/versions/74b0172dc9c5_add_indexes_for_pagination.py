"""Add indexes for pagination performance

Revision ID: 74b0172dc9c5
Revises: 764b5296652c
Create Date: 2026-05-11 22:30:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '74b0172dc9c5'
down_revision: Union[str, None] = '764b5296652c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Indexes for grabs table
    with op.batch_alter_table('grabs') as batch_op:
        batch_op.create_index('ix_grabs_grabbed_at', ['grabbed_at'])
        batch_op.create_index('ix_grabs_arr_name', ['arr_name'])

    # Indexes for downloads table
    with op.batch_alter_table('downloads') as batch_op:
        batch_op.create_index('ix_downloads_added_to_client_at', ['added_to_client_at'])
        batch_op.create_index('ix_downloads_import_completed_at', ['import_completed_at'])
        batch_op.create_index('ix_downloads_deleted_at', ['deleted_at'])
        batch_op.create_index('ix_downloads_upgraded_at', ['upgraded_at'])
        batch_op.create_index('ix_downloads_grab_id', ['grab_id'])   # foreign key column

    # Index for blacklist table
    with op.batch_alter_table('blacklist') as batch_op:
        batch_op.create_index('ix_blacklist_blocked_at', ['blocked_at'])


def downgrade() -> None:
    with op.batch_alter_table('blacklist') as batch_op:
        batch_op.drop_index('ix_blacklist_blocked_at')

    with op.batch_alter_table('downloads') as batch_op:
        batch_op.drop_index('ix_downloads_grab_id')
        batch_op.drop_index('ix_downloads_upgraded_at')
        batch_op.drop_index('ix_downloads_deleted_at')
        batch_op.drop_index('ix_downloads_import_completed_at')
        batch_op.drop_index('ix_downloads_added_to_client_at')

    with op.batch_alter_table('grabs') as batch_op:
        batch_op.drop_index('ix_grabs_arr_name')
        batch_op.drop_index('ix_grabs_grabbed_at')
