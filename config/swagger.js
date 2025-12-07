const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Nocturnal API Documentation',
      version: '1.0.0',
      description: 'Healthcare platform connecting doctors with hospitals for duty shifts',
      contact: {
        name: 'Nocturnal Support',
        email: 'support@nocturnal.com'
      },
      license: {
        name: 'ISC',
        url: 'https://opensource.org/licenses/ISC'
      }
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development server'
      },
      {
        url: 'https://api.nocturnal.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token obtained from login/register'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            name: { type: 'string', example: 'Dr. John Doe' },
            email: { type: 'string', format: 'email', example: 'john@example.com' },
            role: { type: 'string', enum: ['doctor', 'nurse', 'admin'], example: 'doctor' },
            phone: { type: 'string', example: '+1234567890' },
            specialization: { type: 'string', example: 'Cardiology' },
            experience: { type: 'number', example: 5 },
            rating: { type: 'number', format: 'float', example: 4.5 },
            verified: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Duty: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            title: { type: 'string', example: 'Night Shift - Emergency' },
            description: { type: 'string', example: 'Emergency department night shift coverage' },
            hospital: { type: 'string', example: 'City General Hospital' },
            date: { type: 'string', format: 'date', example: '2025-11-15' },
            shift: { type: 'string', enum: ['morning', 'afternoon', 'night'], example: 'night' },
            startTime: { type: 'string', example: '20:00' },
            endTime: { type: 'string', example: '08:00' },
            salary: { type: 'number', example: 500 },
            requirements: {
              type: 'object',
              properties: {
                specialization: { type: 'string', example: 'Emergency Medicine' },
                minExperience: { type: 'number', example: 2 },
                minRating: { type: 'number', example: 4.0 }
              }
            },
            status: { type: 'string', enum: ['OPEN', 'FILLED', 'CLOSED'], example: 'OPEN' },
            applicationsCount: { type: 'number', example: 5 },
            postedBy: { type: 'string', example: '507f1f77bcf86cd799439011' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Application: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            duty: { type: 'string', example: '507f1f77bcf86cd799439011' },
            applicant: { type: 'string', example: '507f1f77bcf86cd799439011' },
            status: { type: 'string', enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'], example: 'PENDING' },
            message: { type: 'string', example: 'I am available and interested in this shift' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Error message description' },
            error: { type: 'string', example: 'Detailed error information' }
          }
        },
        Success: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation completed successfully' },
            data: { type: 'object' }
          }
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Access token is missing or invalid',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  message: { type: 'string', example: 'Not authorized to access this route' }
                }
              }
            }
          }
        },
        ForbiddenError: {
          description: 'User does not have permission to perform this action',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  message: { type: 'string', example: 'User role is not authorized for this action' }
                }
              }
            }
          }
        },
        NotFoundError: {
          description: 'The requested resource was not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        },
        ValidationError: {
          description: 'Request validation failed',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  message: { type: 'string', example: 'Validation failed' },
                  errors: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        field: { type: 'string', example: 'email' },
                        message: { type: 'string', example: 'Valid email is required' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Authentication', description: 'User registration, login, and authentication' },
      { name: 'Users', description: 'User profile and management' },
      { name: 'Duties', description: 'Duty shift management' },
      { name: 'Applications', description: 'Job application management' },
      { name: 'Analytics', description: 'Analytics and insights' },
      { name: 'Admin', description: 'Admin operations and monitoring' }
    ]
  },
  apis: [
    './routes/*.js',
    './routes/admin/*.js',
    './models/*.js'
  ]
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
