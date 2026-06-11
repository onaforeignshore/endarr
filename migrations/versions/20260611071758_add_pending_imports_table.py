"""Add pending_imports table for out-of-order download events

Revision ID: xxxxxxxxxxxx
Revises: 74b0172dc9c5
Create Date: 2026-06-11 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '20260611071758'
down_revision: Union[str, None] = '74b0172dc9c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'pending_imports',
        sa.Column('hash', sa.String(), nullable=False),
        sa.Column('import_completed_at', sa.Float(), nullable=False),
        sa.Column('arr_name', sa.String(), nullable=True),
        sa.Column('media_id', sa.String(), nullable=True),
        sa.Column('created_at', sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint('hash')
    )
    with op.batch_alter_table('pending_imports') as batch_op:
        batch_op.create_index('ix_pending_imports_created_at', ['created_at'])


def downgrade() -> None:
    op.drop_table('pending_imports')
