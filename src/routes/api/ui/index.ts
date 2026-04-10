// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Logger, StorageDirectoryDescriptor } from '../../../types';
import { UserService } from '../../../services/userService';
import { SessionService } from '../../../services/sessionService';
import { AuthService } from '../../../services/authService';
import { AuthenticatedFastifyRequest } from '../../../middleware/fastifyAuth';
import {
  createConditionalHybridAuthMiddleware,
  FastifyAuthConfig,
} from '../../../middleware/fastifyAuth';
import {
  name as packageName,
  version,
  git_commit_hash,
} from '../../../generated/packageMetadata';
import {
  StorageService,
  StoredDirectoryInfo,
  StoredFileGroupSummaryInfo,
  StoredFileVersionInfo,
} from '../../../services/storageService';

/**
 * Configuration for UI routes
 */
export interface UiRoutesConfig {
  userService: UserService;
  sessionService: SessionService;
  authService: AuthService;
  authConfig: FastifyAuthConfig;
  storageService: StorageService;
  logger: Logger;
  realm: string;
  serverUrl: {
    baseUrl?: string;
    port: number;
    isHttps: boolean;
  };
  storageDirectories: string[];
  storageDirectoryDetails: StorageDirectoryDescriptor[];
}

/**
 * POST /api/ui/config request body (empty object)
 */
export interface ConfigRequest {
  // Empty object for consistency
}

/**
 * POST /api/ui/config response
 */
export interface ConfigResponse {
  realm: string;
  name: string;
  version: string;
  git_commit_hash: string;
  serverUrl: {
    baseUrl?: string;
    port: number;
    isHttps: boolean;
  };
  authMode: string;
  authEnabled: {
    general: boolean;
    publish: boolean;
    admin: boolean;
  };
  currentUser: {
    username: string;
    role: string;
    authenticated: boolean;
  } | null;
  storageDirectories: string[];
  storageDirectoryDetails: StorageDirectoryDescriptor[];
}

/**
 * GET /api/ui/browse/directories response
 */
export interface BrowseDirectoriesResponse {
  items: StoredDirectoryInfo[];
}

/**
 * GET /api/ui/browse/file-groups response
 */
export interface BrowseFileGroupsResponse {
  directoryPath: string;
  items: StoredFileGroupSummaryInfo[];
}

/**
 * GET /api/ui/browse/versions response
 */
export interface BrowseVersionsResponse {
  publicPath: string;
  items: StoredFileVersionInfo[];
}

/**
 * GET /api/ui/browse/search response
 */
export interface BrowseSearchResponse {
  query: string;
  items: StoredFileGroupSummaryInfo[];
}

/**
 * POST /api/ui/users request body for user management
 */
export interface UserManagementRequest {
  action: 'list' | 'create' | 'delete' | 'update';
  username?: string;
  password?: string;
  role?: 'admin' | 'publish' | 'read';
}

/**
 * User list response
 */
export interface UserListResponse {
  users: Array<{
    id: string;
    username: string;
    role: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

/**
 * User creation response
 */
export interface UserCreateResponse {
  user: {
    id: string;
    username: string;
    role: string;
    createdAt: string;
    updatedAt: string;
  };
}

/**
 * User deletion response
 */
export interface UserDeleteResponse {
  success: boolean;
  message: string;
}

/**
 * API password regeneration request (empty for current user)
 */
export interface ApiPasswordRegenerateRequest {
  // Empty object - regenerates API password for current user
}

/**
 * API password regeneration response
 */
export interface ApiPasswordRegenerateResponse {
  apiPassword: string;
  username: string;
}

/**
 * Password change request
 */
export interface PasswordChangeRequest {
  currentPassword?: string; // Required for self password change
  newPassword: string;
  username?: string; // For admin changing other user's password
}

/**
 * Password change response
 */
export interface PasswordChangeResponse {
  success: boolean;
  message: string;
}

/**
 * Session-only authentication middleware
 */
const createSessionOnlyAuthMiddleware = (
  sessionService: SessionService,
  logger: Logger
) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionToken = request.cookies?.sessionToken;

    if (!sessionToken) {
      return reply
        .status(401)
        .send({ error: 'Session authentication required' });
    }

    const session = await sessionService.validateSession(sessionToken);
    if (!session) {
      return reply.status(401).send({ error: 'Invalid or expired session' });
    }

    // Add user info to request
    (request as any).user = {
      id: session.userId,
      username: session.username,
      role: session.role,
    };

    logger.info(
      `Session auth successful: ${session.username} (${session.role})`
    );
  };
};

/**
 * Role-based authorization helper
 */
const requireRole = (
  request: AuthenticatedFastifyRequest,
  reply: FastifyReply,
  roles: string[]
) => {
  if (!request.user || !roles.includes(request.user.role)) {
    return reply.status(403).send({ error: 'Insufficient permissions' });
  }
  return undefined;
};

/**
 * Registers UI Backend API routes with Fastify instance
 */
export const registerUiRoutes = async (
  fastify: FastifyInstance,
  config: UiRoutesConfig
) => {
  const {
    userService,
    sessionService,
    authService,
    authConfig,
    storageService,
    logger,
    realm,
    serverUrl,
    storageDirectories,
    storageDirectoryDetails,
  } = config;

  // Create session-only auth middleware
  const sessionOnlyAuth = createSessionOnlyAuthMiddleware(
    sessionService,
    logger
  );
  const generalAuthHandler = authService.isAuthRequired('general')
    ? createConditionalHybridAuthMiddleware(authConfig)
    : null;
  const generalAuthPreHandler = generalAuthHandler
    ? ([generalAuthHandler] as any)
    : [];

  // POST /api/ui/config - Application configuration (public endpoint)
  fastify.post(
    '/config',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        let currentUser = null;

        try {
          // Check session authentication first (Cookie-based)
          const sessionToken = request.cookies?.sessionToken;
          if (sessionToken) {
            const session = await sessionService.validateSession(sessionToken);
            if (session) {
              currentUser = {
                username: session.username,
                role: session.role,
                authenticated: true,
              };
            }
          }

          // If no session, check Basic authentication (API clients)
          if (!currentUser) {
            const authHeader = request.headers.authorization;
            if (
              authHeader &&
              typeof authHeader === 'string' &&
              authHeader.startsWith('Basic ')
            ) {
              const credentials = authHeader.substring(6);
              const decodedCredentials = Buffer.from(
                credentials,
                'base64'
              ).toString('utf-8');
              const colonIndex = decodedCredentials.indexOf(':');

              if (colonIndex !== -1) {
                const username = decodedCredentials.substring(0, colonIndex);
                const password = decodedCredentials.substring(colonIndex + 1);

                const user = await userService.validateApiPassword(
                  username,
                  password
                );
                if (user) {
                  currentUser = {
                    username: user.username,
                    role: user.role,
                    authenticated: true,
                  };
                }
              }
            }
          }
        } catch (error) {
          logger.error(
            `Error checking authentication for /api/ui/config: ${error}`
          );
        }

        const response: ConfigResponse = {
          realm: realm,
          name: packageName,
          version: version,
          git_commit_hash: git_commit_hash,
          serverUrl: serverUrl,
          authMode: authService.getAuthMode(),
          authEnabled: {
            general: authService.isAuthRequired('general'),
            publish: authService.isAuthRequired('publish'),
            admin: authService.isAuthRequired('admin'),
          },
          currentUser: currentUser,
          storageDirectories,
          storageDirectoryDetails,
        };

        return reply.send(response);
      } catch (error) {
        logger.error(`Error in /api/ui/config: ${error}`);
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  fastify.get(
    '/browse/directories',
    {
      preHandler: generalAuthPreHandler,
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const response: BrowseDirectoriesResponse = {
          items: await storageService.listBrowseDirectories(),
        };
        return reply.send(response);
      } catch (error) {
        logger.error(`Error in /api/ui/browse/directories: ${error}`);
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  fastify.get(
    '/browse/file-groups',
    {
      preHandler: generalAuthPreHandler,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as {
        directory?: string;
      };

      if (!query.directory) {
        return reply.status(400).send({ error: 'Directory is required' });
      }

      try {
        const response: BrowseFileGroupsResponse = {
          directoryPath: query.directory,
          items: await storageService.listDirectoryFileGroups(query.directory),
        };
        return reply.send(response);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === 'Directory is not defined in storage rules'
        ) {
          return reply.status(404).send({ error: error.message });
        }

        logger.error(`Error in /api/ui/browse/file-groups: ${error}`);
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  fastify.get(
    '/browse/versions',
    {
      preHandler: generalAuthPreHandler,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as {
        publicPath?: string;
      };

      if (!query.publicPath) {
        return reply.status(400).send({ error: 'Public path is required' });
      }

      try {
        const response: BrowseVersionsResponse = {
          publicPath: query.publicPath,
          items: await storageService.listFileGroupVersions(query.publicPath),
        };
        return reply.send(response);
      } catch (error) {
        logger.error(`Error in /api/ui/browse/versions: ${error}`);
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  fastify.get(
    '/browse/search',
    {
      preHandler: generalAuthPreHandler,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as {
        q?: string;
      };

      const searchQuery = query.q?.trim() ?? '';

      try {
        const response: BrowseSearchResponse = {
          query: searchQuery,
          items:
            searchQuery.length > 0
              ? await storageService.searchFileGroups(searchQuery)
              : [],
        };
        return reply.send(response);
      } catch (error) {
        logger.error(`Error in /api/ui/browse/search: ${error}`);
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // POST /api/ui/users - User management (admin permission required)
  fastify.post(
    '/users',
    {
      preHandler: [sessionOnlyAuth],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authRequest = request as AuthenticatedFastifyRequest;
      try {
        // All user management operations require admin role
        const roleCheck = requireRole(authRequest, reply, ['admin']);
        if (roleCheck) return roleCheck;

        const body = request.body as UserManagementRequest;

        switch (body.action) {
          case 'list': {
            const users = await userService.getAllUsers();

            const response: UserListResponse = {
              users: users.map((user) => ({
                id: user.id,
                username: user.username,
                role: user.role,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
              })),
            };

            return reply.send(response);
          }

          case 'create': {
            if (!body.username || !body.password || !body.role) {
              return reply
                .status(400)
                .send({ error: 'Username, password, and role are required' });
            }

            logger.info(
              `Creating new user: ${body.username} with role: ${body.role}`
            );

            const user = await userService.createUser({
              username: body.username,
              password: body.password,
              role: body.role,
            });

            logger.info(`User ${body.username} created successfully`);

            const response: UserCreateResponse = {
              user: {
                id: user.id,
                username: user.username,
                role: user.role,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
              },
            };

            return reply.status(201).send(response);
          }

          case 'delete': {
            if (!body.username) {
              return reply.status(400).send({ error: 'Username is required' });
            }

            logger.info(`Deleting user: ${body.username}`);

            const deleted = await userService.deleteUser(body.username);
            if (!deleted) {
              return reply.status(404).send({ error: 'User not found' });
            }

            logger.info(`User ${body.username} deleted successfully`);

            const response: UserDeleteResponse = {
              success: true,
              message: 'User deleted successfully',
            };

            return reply.send(response);
          }

          case 'update': {
            if (!body.username || !body.password) {
              return reply
                .status(400)
                .send({ error: 'Username and password are required' });
            }

            // Prevent users from changing their own password via this endpoint
            // Users should use the separate password change endpoint
            if (
              authRequest.user &&
              authRequest.user.username === body.username
            ) {
              return reply.status(403).send({
                error: 'Cannot change your own password via this endpoint',
              });
            }

            logger.info(`Updating password for user: ${body.username}`);

            const updatedUser = await userService.updateUser(body.username, {
              password: body.password,
            });
            if (!updatedUser) {
              return reply.status(404).send({ error: 'User not found' });
            }

            logger.info(`Password updated for user: ${body.username}`);

            const response = {
              success: true,
              message: 'Password updated successfully',
            };

            return reply.send(response);
          }

          default:
            return reply
              .status(400)
              .send({ error: `Unknown action: ${body.action}` });
        }
      } catch (error: any) {
        if (error.statusCode) {
          throw error; // Re-throw HTTP errors
        }
        logger.error(`Error in /api/ui/users: ${error}`);
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // POST /api/ui/apipassword - Regenerate API password for current user (session auth required)
  // DEPRECATED: Use /api/ui/apipasswords instead
  fastify.post(
    '/apipassword',
    {
      preHandler: [sessionOnlyAuth],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authRequest = request as AuthenticatedFastifyRequest;
      try {
        logger.info(
          `[DEPRECATED] Regenerating API password for user: ${authRequest.user?.username}`
        );

        const result = await userService.regenerateApiPassword(
          authRequest.user?.username || ''
        );
        if (!result) {
          return reply.status(404).send({ error: 'User not found' });
        }

        logger.info(
          `API password regenerated successfully for user: ${authRequest.user?.username}`
        );

        const response: ApiPasswordRegenerateResponse = {
          apiPassword: result.apiPassword,
          username: authRequest.user?.username || '',
        };

        return reply.send(response);
      } catch (error: any) {
        if (error.statusCode) {
          throw error; // Re-throw HTTP errors
        }
        logger.error(`Error in /api/ui/apipassword: ${error}`);
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // POST /api/ui/apipasswords - Manage multiple API passwords (session auth required)
  fastify.post(
    '/apipasswords',
    {
      preHandler: [sessionOnlyAuth],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authRequest = request as AuthenticatedFastifyRequest;
      try {
        const body = request.body as {
          action: 'list' | 'add' | 'delete';
          label?: string;
        };

        const username = authRequest.user?.username;
        if (!username) {
          return reply.status(401).send({ error: 'User not authenticated' });
        }

        switch (body.action) {
          case 'list': {
            logger.info(`Listing API passwords for user: ${username}`);

            const result = await userService.listApiPasswords(username);
            if (!result) {
              return reply.status(404).send({ error: 'User not found' });
            }

            return reply.send(result);
          }

          case 'add': {
            if (!body.label) {
              return reply
                .status(400)
                .send({ error: 'Label is required for adding API password' });
            }

            logger.info(
              `Adding API password with label "${body.label}" for user: ${username}`
            );

            try {
              const result = await userService.addApiPassword(
                username,
                body.label
              );
              if (!result) {
                return reply.status(404).send({ error: 'User not found' });
              }

              logger.info(
                `API password added successfully with label "${body.label}" for user: ${username}`
              );
              return reply.send(result);
            } catch (error: any) {
              logger.warn(`Failed to add API password: ${error.message}`);
              return reply.status(400).send({ error: error.message });
            }
          }

          case 'delete': {
            if (!body.label) {
              return reply
                .status(400)
                .send({ error: 'Label is required for deleting API password' });
            }

            logger.info(
              `Deleting API password with label "${body.label}" for user: ${username}`
            );

            const result = await userService.deleteApiPassword(
              username,
              body.label
            );

            if (!result.success) {
              logger.warn(`Failed to delete API password: ${result.message}`);
              return reply.status(404).send({ error: result.message });
            }

            logger.info(
              `API password deleted successfully with label "${body.label}" for user: ${username}`
            );
            return reply.send(result);
          }

          default:
            return reply
              .status(400)
              .send({ error: `Unknown action: ${body.action}` });
        }
      } catch (error: any) {
        if (error.statusCode) {
          throw error; // Re-throw HTTP errors
        }
        logger.error(`Error in /api/ui/apipasswords: ${error}`);
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // POST /api/ui/password - Change password (session auth required)
  fastify.post(
    '/password',
    {
      preHandler: [sessionOnlyAuth],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authRequest = request as AuthenticatedFastifyRequest;
      try {
        const body = request.body as PasswordChangeRequest;

        if (!body.newPassword) {
          return reply.status(400).send({ error: 'New password is required' });
        }

        if (body.username) {
          // Admin changing another user's password
          const roleCheck = requireRole(authRequest, reply, ['admin']);
          if (roleCheck) return roleCheck;

          logger.info(
            `Admin ${authRequest.user?.username} changing password for user: ${body.username}`
          );

          const updated = await userService.updateUser(body.username, {
            password: body.newPassword,
          });
          if (!updated) {
            return reply.status(404).send({ error: 'User not found' });
          }

          logger.info(
            `Password changed successfully for user: ${body.username}`
          );
        } else {
          // User changing their own password
          if (!body.currentPassword) {
            return reply.status(400).send({
              error: 'Current password is required for self password change',
            });
          }

          // Validate current password
          const user = await userService.validateCredentials(
            authRequest.user?.username || '',
            body.currentPassword
          );
          if (!user) {
            return reply
              .status(401)
              .send({ error: 'Current password is incorrect' });
          }

          logger.info(
            `User ${authRequest.user?.username} changing their own password`
          );

          const updated = await userService.updateUser(
            authRequest.user?.username || '',
            {
              password: body.newPassword,
            }
          );
          if (!updated) {
            return reply.status(404).send({ error: 'User not found' });
          }

          logger.info(
            `Password changed successfully for user: ${authRequest.user?.username}`
          );
        }

        const response: PasswordChangeResponse = {
          success: true,
          message: 'Password updated successfully',
        };

        return reply.send(response);
      } catch (error: any) {
        if (error.statusCode) {
          throw error; // Re-throw HTTP errors
        }
        logger.error(`Error in /api/ui/password: ${error}`);
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  logger.info('UI Backend API routes registered successfully');
};
