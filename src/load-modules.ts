import { ModuleDescriptor, GlobWithOptions, listModules } from './list-modules'
import { Lifetime } from './lifetime'
import { ResolverOptions, RESOLVER, asClass, asFunction } from './resolvers'
import { AwilixContainer } from './container'
import { isClass, isFunction } from './utils'

const camelCase = require('camel-case')

/**
 * The options when invoking loadModules().
 * @interface LoadModulesOptions
 */
export interface LoadModulesOptions {
  cwd?: string
  formatName?: NameFormatter | BuiltInNameFormatters
  resolverOptions?: ResolverOptions<any>
}

/**
 * Name formatting options when using loadModules().
 * @type BuiltInNameFormatters
 */
export type BuiltInNameFormatters = 'camelCase'

/**
 * Takes in the filename of the module being loaded as well as the module descriptor,
 * and returns a string which is used to register the module in the container.
 *
 * `descriptor.name` is the same as `name`.
 *
 * @type {NameFormatter}
 */
export type NameFormatter = (
  name: string,
  descriptor: ModuleDescriptor
) => string

/**
 * Dependencies for `loadModules`
 */
export interface LoadModulesDeps {
  listModules: typeof listModules
  container: AwilixContainer
  require(path: string): any
}

const nameFormatters = {
  camelCase
}

/**
 * Given an array of glob strings, will call `require`
 * on them, and call their default exported function with the
 * container as the first parameter.
 *
 * @param  {AwilixContainer} dependencies.container
 * The container to install loaded modules in.
 *
 * @param  {Function} dependencies.listModules
 * The listModules function to use for listing modules.
 *
 * @param  {Function} dependencies.require
 * The require function - it's a dependency because it makes testing easier.
 *
 * @param  {String[]} globPatterns
 * The array of globs to use when loading modules.
 *
 * @param  {Object} opts
 * Passed to `listModules`, e.g. `{ cwd: '...' }`.
 *
 * @param  {(string, ModuleDescriptor) => string} opts.formatName
 * Used to format the name the module is registered with in the container.
 *
 * @return {Object}
 * Returns an object describing the result.
 */
export function loadModules(
  dependencies: LoadModulesDeps,
  globPatterns: string | Array<string | GlobWithOptions>,
  opts?: LoadModulesOptions
) {
  const container = dependencies.container
  opts = optsWithDefaults(opts, container)
  const modules = dependencies.listModules(globPatterns, opts)

  const result = modules.map(m => {
    const loaded = dependencies.require(m.path)

    // Meh, it happens.
    if (!loaded) {
      return undefined
    }

    if (!isFunction(loaded)) {
      if (loaded.default && isFunction(loaded.default)) {
        // ES6 default export
        return {
          name: m.name,
          path: m.path,
          value: loaded.default,
          opts: m.opts
        }
      }

      return undefined
    }

    return {
      name: m.name,
      path: m.path,
      value: loaded,
      opts: m.opts
    }
  })
  result.filter(x => x).forEach(registerDescriptor.bind(null, container, opts))
  return {
    loadedModules: modules
  }
}

/**
 * Returns a new options object with defaults applied.
 */
function optsWithDefaults(
  opts: Partial<LoadModulesOptions> | undefined,
  container: AwilixContainer
): LoadModulesOptions {
  return Object.assign(
    {},
    {
      // Does a somewhat-deep merge on the registration options.
      registrationOptions: Object.assign(
        {
          lifetime: Lifetime.TRANSIENT,
          injectionMode: container.options.injectionMode
        },
        opts && opts.resolverOptions
      )
    },
    opts
  )
}

/**
 * Given a module descriptor, reads it and registers it's value with the container.
 *
 * @param {AwilixContainer} container
 * @param {LoadModulesOptions} opts
 * @param {ModuleDescriptor} moduleDescriptor
 */
function registerDescriptor(
  container: AwilixContainer,
  opts: LoadModulesOptions,
  moduleDescriptor: ModuleDescriptor & { value: any }
) {
  const inlineConfig = moduleDescriptor.value[RESOLVER]
  let name = inlineConfig && inlineConfig.name
  if (!name) {
    name = moduleDescriptor.name
    let formatter = opts.formatName
    if (formatter) {
      if (typeof formatter === 'string') {
        formatter = nameFormatters[formatter]
      }

      if (formatter) {
        name = (formatter as NameFormatter)(name, moduleDescriptor)
      }
    }
  }

  let moduleDescriptorOpts = moduleDescriptor.opts

  if (typeof moduleDescriptorOpts === 'string') {
    moduleDescriptorOpts = { lifetime: moduleDescriptorOpts }
  }

  const regOpts = Object.assign({}, opts.resolverOptions, moduleDescriptorOpts)

  const reg = regOpts.register
    ? regOpts.register
    : isClass(moduleDescriptor.value) ? asClass : asFunction

  container.register(name, reg(moduleDescriptor.value, regOpts))
}