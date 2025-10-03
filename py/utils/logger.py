import logging


def configure_logging(level=logging.INFO):
    """
    Configure root logger for the application.
    """
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
        handlers=[
            logging.StreamHandler()
        ]
    )
    logger = logging.getLogger(__name__)
    logger.debug("Logging configured.")
    return logger