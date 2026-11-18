function requireInstitution(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  if (req.user.role !== "admin" && req.user.role !== "instructor") {
    return res.status(403).json({
      success: false,
      message: "Institution role required",
    });
  }

  if (req.user.institution_id == null) {
    return res.status(403).json({
      success: false,
      message: "Institution context required",
    });
  }

  return next();
}

module.exports = { requireInstitution };
