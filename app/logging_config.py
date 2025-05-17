import logging
import sys

def setup_logging():
    # Prevent duplicate loggers
    for handler in logging.root.handlers[:]:
        logging.root.removeHandler(handler)

    # Configure the root logger
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        stream=sys.stdout,
        force=True  # This will override any existing configuration
    )

    # Create our app logger
    logger = logging.getLogger("app")
    logger.setLevel(logging.INFO)
    logger.propagate = False  # Prevent propagation to avoid duplicate logs

    # Ensure all handlers use the same format
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    
    # Clear any existing handlers and add our stdout handler
    logger.handlers = []
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    logger.addHandler(handler)

    # Set up auth logger specifically for authentication events
    auth_logger = logging.getLogger("app.auth")
    auth_logger.setLevel(logging.INFO)
    auth_logger.propagate = False  # Prevent propagation to avoid duplicate logs
    auth_logger.handlers = []
    auth_logger.addHandler(handler)

    return logger, auth_logger 