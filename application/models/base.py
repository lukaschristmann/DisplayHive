"""Database models for displayhive application."""

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for SQLAlchemy models."""
    pass


db = SQLAlchemy(model_class=Base)


# Association table for many-to-many between Screengroup and Screen
screengroup_screen = db.Table(
    "screengroup_screen",
    db.metadata,
    db.Column("screen_id", db.Integer, db.ForeignKey("screen.id"), primary_key=True),
    db.Column("screengroup_id", db.Integer, db.ForeignKey("screengroup.id"), primary_key=True),
)

# Association table for many-to-many between ContentElement and Screengroup
content_element_screengroup = db.Table(
    "content_element_screengroup",
    db.metadata,
    db.Column("content_element_id", db.Integer, db.ForeignKey("content_element.id"), primary_key=True),
    db.Column("screengroup_id", db.Integer, db.ForeignKey("screengroup.id"), primary_key=True),
)
